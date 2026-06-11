// Write layer for the gh-pages store (docs/architecture.md §2). All writers emit
// deterministic JSON (stable key order) so a commit's diff is minimal. The VFS
// writer enforces the 256 KB quota by ERASING an over-budget bot's VFS (§2.5).
//
// The engine batches every write of a run and the workflow makes a single
// commit; these functions just place files, leaving git to the workflow.

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RegistryIndex, Scores, RegistryState, TournamentMeta, MatchLog } from '../types.ts';
import { enforceVfsQuota, sanitizeVfsKey, VFS_BYTE_CAP, type Vfs } from '../host/vfs.ts';
import {
    serializeRegistryIndex,
    serializeScores,
    serializeRegistryState,
    serializeMeta,
    serializeMatchLog,
} from './schema.ts';
import {
    indexPath,
    scoresPath,
    registryStatePath,
    metaPath,
    wasmPath,
    iconPath,
    vfsDir,
    matchLogPath,
} from './paths.ts';

async function writeFileEnsured(path: string, data: string | Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
}

export async function writeIndex(base: string, index: RegistryIndex): Promise<void> {
    await writeFileEnsured(indexPath(base), serializeRegistryIndex(index));
}

export async function writeScores(base: string, scores: Scores): Promise<void> {
    await writeFileEnsured(scoresPath(base), serializeScores(scores));
}

export async function writeRegistryState(base: string, state: RegistryState): Promise<void> {
    await writeFileEnsured(registryStatePath(base), serializeRegistryState(state));
}

export async function writeMeta(base: string, meta: TournamentMeta): Promise<void> {
    await writeFileEnsured(metaPath(base), serializeMeta(meta));
}

/** Cache a component's bytes at wasm/<id>/<version>.wasm; returns the store-relative path. */
export async function cacheWasm(base: string, botId: string, version: string, bytes: Uint8Array): Promise<string> {
    const path = wasmPath(base, botId, version);
    await writeFileEnsured(path, bytes);
    return `wasm/${botId}/${version}.wasm`;
}

/** Cache a bot's 100x100 avatar at icons/<id>.png; returns the store-relative path. */
export async function cacheIcon(base: string, botId: string, pngBytes: Uint8Array): Promise<string> {
    const path = iconPath(base, botId);
    await writeFileEnsured(path, pngBytes);
    return `icons/${botId}.png`;
}

/** Write one match log under matches/YYYY/MM/DD/<runId>/<matchId>.json. */
export async function writeMatchLog(base: string, runId: string, log: MatchLog, when = new Date()): Promise<string> {
    const path = matchLogPath(base, runId, log.matchId, when);
    await writeFileEnsured(path, serializeMatchLog(log));
    return path;
}

/**
 * Persist a bot's VFS, enforcing the 256 KB quota: an over-budget VFS is ERASED
 * (the bot starts fresh next match). The bot's vfs/<id>/ dir is rewritten from
 * scratch so removed files don't linger. Returns whether the VFS overflowed.
 */
export async function writeVfs(base: string, botId: string, fs: Vfs, cap = VFS_BYTE_CAP): Promise<{ overflowed: boolean }> {
    const { fs: toPersist, overflowed } = enforceVfsQuota(fs, cap);
    const dir = vfsDir(base, botId);
    // Rewrite from scratch: remove the old tree, then write the (possibly empty) set.
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const [rel, value] of toPersist) {
        // VFS keys are bot-controlled; skip any that would escape vfs/<id>/.
        const safe = sanitizeVfsKey(rel);
        if (safe == null) continue;
        const path = join(dir, ...safe.split('/'));
        await writeFileEnsured(path, value);
    }
    return { overflowed };
}
