// OCI change detection (docs/architecture.md §2.4, §4.1).
//
// Each scheduled tick does a cheap conditional manifest check per active bot
// against registry-state.json. A bot whose digest changed (or that the scheduler
// hasn't seen) joins the run's CHANGED set; if the set is empty the run exits
// without doing any work. The manifest check is network I/O, so it is injected
// (a ManifestChecker) and STUBBED for production for now (TODO).

import type { BotRecord, RegistryState } from '../types.ts';
import { REGISTRY_STATE_VERSION } from '../store/schema.ts';

/** Result of a conditional manifest request for one bot. */
export interface ManifestStatus {
    /** True when the image changed (or 304 → false). */
    changed: boolean;
    /** Current manifest digest, or null if unknown. */
    digest: string | null;
    /** Current manifest ETag, or null. */
    etag: string | null;
    /** True when the ref no longer resolves (→ the bot is retired). */
    notFound?: boolean;
}

/**
 * Issue a conditional manifest request for `oci` given the last-seen `etag`.
 * Returns whether the image changed plus the current digest/ETag.
 */
export type ManifestChecker = (oci: string, etag: string | null) => Promise<ManifestStatus>;

export interface DetectResult {
    /** Ids of bots whose image changed since the last tick. */
    changed: string[];
    /** Ids of bots whose OCI ref no longer resolves (to be marked retired). */
    retired: string[];
    /** The updated registry-state to persist. */
    state: RegistryState;
}

/**
 * The production checker. TODO: HEAD/GET the manifest with If-None-Match and
 * compare the digest. Until then it throws so the dependency is explicit.
 */
export const notImplementedChecker: ManifestChecker = async (oci) => {
    throw new Error(`OCI manifest check not implemented (TODO) for "${oci}"`);
};

/** A test checker backed by a ref → status map. */
export function mapChecker(map: Map<string, ManifestStatus>): ManifestChecker {
    return async (oci) => {
        const s = map.get(oci);
        if (!s) return { changed: false, digest: null, etag: null };
        return s;
    };
}

/**
 * Detect changed bots among the active set. The registry-state is initialized
 * from each bot's record `ociDigest` the first time it is seen (a never-before-
 * seen bot counts as changed so it gets its first matches). Only `active` bots
 * are checked.
 */
export async function detectChanges(
    bots: readonly BotRecord[],
    prevState: RegistryState | null,
    check: ManifestChecker,
    checkedAt: string = new Date().toISOString(),
): Promise<DetectResult> {
    const state: RegistryState = {
        version: REGISTRY_STATE_VERSION,
        checkedAt,
        bots: {},
    };
    const changed: string[] = [];
    const retired: string[] = [];

    for (const bot of bots) {
        if (bot.status !== 'active') continue;
        const known = prevState?.bots[bot.id];
        const lastEtag = known?.etag ?? null;
        const status = await check(bot.oci, lastEtag);

        if (status.notFound) {
            // The image no longer resolves → retire the bot (drop from rosters).
            // It is intentionally NOT carried in the new registry-state.
            retired.push(bot.id);
            continue;
        }

        if (!known) {
            // First time the scheduler sees this bot → it is "changed" so it
            // gets its initial matches. Seed state from the manifest (or the
            // record's admitted digest as a fallback).
            changed.push(bot.id);
            state.bots[bot.id] = {
                oci: bot.oci,
                digest: status.digest ?? bot.ociDigest,
                etag: status.etag ?? bot.ociEtag,
            };
            continue;
        }

        const newDigest = status.digest ?? known.digest;
        if (status.changed || (newDigest != null && newDigest !== known.digest)) {
            changed.push(bot.id);
            state.bots[bot.id] = { oci: bot.oci, digest: newDigest, etag: status.etag ?? known.etag };
        } else {
            // Unchanged: carry the previous state forward (update ETag if given).
            state.bots[bot.id] = { oci: bot.oci, digest: known.digest, etag: status.etag ?? known.etag };
        }
    }

    return { changed, retired, state };
}
