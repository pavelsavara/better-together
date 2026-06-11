// Validation checks (docs/architecture.md §3.1, engine-rules §Validation).
//
// Runs the ordered checks against a submitted bot, failing fast with a specific,
// contributor-friendly message. The OCI pull and avatar processing are injected
// (see pull-oci.ts / avatar.ts) so this pipeline is fully testable offline with
// local sample bytes. A passing result carries everything admit.ts needs to
// cache artifacts and upsert the registry.

import { createHash } from 'node:crypto';
import type { Metadata, RegistryIndex } from '../types.ts';
import { createGardenerSeat, type GardenerSeat } from '../host/seat.ts';
import { runMatch } from '../core/match.ts';
import { manufactureId, parseName, graphemeCount } from './id.ts';
import { MAX_COMPONENT_BYTES, type OciPuller } from './pull-oci.ts';
import { isValidIconUrl, type AvatarProcessor } from './avatar.ts';

export interface SubmissionInput {
    oci: string;
    blurb: string;
    /** GitHub handle of the issue author (read from the GitHub API), used as the bot's author credit. */
    author: string;
    submittedBy: string;
    approvedBy: string;
    issue: number;
}

export interface ValidationDeps {
    pullOci: OciPuller;
    processAvatar: AvatarProcessor;
    /** At least 3 built samples used to fill the smoke-match roster. */
    fillerSamples: ReadonlyArray<{ id: string; bytes: Uint8Array }>;
    /**
     * Per-call wall-clock budget for the smoke match. Defaults to 0 (disabled)
     * because the debug jsco build is far slower than 50 ms/call. TODO: set 50
     * with a release jsco build in production CI to enforce the timing budget.
     */
    callBudgetMs?: number;
    now?: () => string;
}

export interface AdmitData {
    id: string;
    metadata: Metadata;
    namespace: string;
    shortName: string;
    bytes: Uint8Array;
    digest: string | null;
    etag: string | null;
    wasmSha256: string;
    avatarPng: Uint8Array | null;
    iconSource: string | null;
    oci: string;
    /** GitHub handle of the issue author (read from the GitHub API). */
    author: string;
    submittedBy: string;
    approvedBy: string;
    issue: number;
    validatedAt: string;
}

export type ValidationResult = { ok: true; admit: AdmitData } | { ok: false; reason: string };

/** SHA-256 of bytes as lower-case hex. */
export function sha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function reject(reason: string): ValidationResult {
    return { ok: false, reason };
}

/**
 * Run the full validation pipeline. Returns `{ ok: true, admit }` on success or
 * `{ ok: false, reason }` with the exact failing rule. Never throws for a
 * bot-caused failure (those become reasons); only a broken dependency throws.
 */
export async function runValidation(
    input: SubmissionInput,
    existingIndex: RegistryIndex,
    deps: ValidationDeps,
): Promise<ValidationResult> {
    const now = deps.now?.() ?? new Date().toISOString();
    const budget = deps.callBudgetMs ?? 0;

    // 1. OCI pullable.
    let artifact;
    try {
        artifact = await deps.pullOci(input.oci);
    } catch (e) {
        return reject(`Could not pull the OCI image \`${input.oci}\`: ${(e as Error).message}`);
    }
    const { bytes, digest, etag } = artifact;

    // 2. Size limit (friendly reject).
    if (bytes.byteLength > MAX_COMPONENT_BYTES) {
        const mb = (bytes.byteLength / (1024 * 1024)).toFixed(1);
        return reject(`Component is ${mb} MB, over the 15 MB limit — please trim it and resubmit.`);
    }

    // 3-4. Component shape + metadata() within budget (jsco instantiation).
    let candidate: GardenerSeat;
    try {
        candidate = await createGardenerSeat(bytes, { id: input.oci, callBudgetMs: budget });
    } catch (e) {
        return reject(`Component does not instantiate as a gardener: ${(e as Error).message}`);
    }

    try {
        const metadata = candidate.metadata();

        // 5. name = namespace.name; namespace regex; name non-empty.
        const parsed = parseName(metadata.name);
        if (!parsed) {
            return reject(
                `metadata.name "${metadata.name}" must be \`namespace.name\` with exactly one dot and namespace matching ^[a-z][a-z0-9-]*$.`,
            );
        }

        // 6. glyph is a single UTF character.
        if (graphemeCount(metadata.glyph) !== 1) {
            return reject(`metadata.glyph must be a single character; got "${metadata.glyph}".`);
        }

        // 7-8. icon shape + avatar fetch/validate/resize.
        let avatarPng: Uint8Array | null = null;
        let iconSource: string | null = null;
        if (metadata.icon != null) {
            if (!isValidIconUrl(metadata.icon)) {
                return reject(`metadata.icon must be a valid https URL; got "${metadata.icon}".`);
            }
            iconSource = metadata.icon;
            try {
                const result = await deps.processAvatar(metadata.icon);
                avatarPng = result.png;
            } catch (e) {
                return reject(`Avatar at \`${metadata.icon}\` could not be fetched/decoded/resized: ${(e as Error).message}`);
            }
        }

        // 9. Manufacture id.
        const id = manufactureId(input.oci, metadata.name);

        // 10. Identity unique (the manufactured id, hence the OCI ref, is new).
        if (existingIndex.bots.some((b) => b.id === id)) {
            return reject(`A bot with id \`${id}\` (this exact OCI ref) is already registered.`);
        }

        // 11-12. Capability denial + smoke-test match on a scratch VFS.
        const smoke = await runSmokeMatch(bytes, deps, budget);
        if (!smoke.ok) return reject(smoke.reason);

        return {
            ok: true,
            admit: {
                id,
                metadata,
                namespace: parsed.namespace,
                shortName: parsed.shortName,
                bytes,
                digest,
                etag,
                wasmSha256: sha256Hex(bytes),
                avatarPng,
                iconSource,
                oci: input.oci,
                author: input.author,
                submittedBy: input.submittedBy,
                approvedBy: input.approvedBy,
                issue: input.issue,
                validatedAt: now,
            },
        };
    } finally {
        candidate.dispose();
    }
}

/**
 * Run a 4-seat smoke match with the candidate + 3 fillers on a scratch VFS that
 * is thrown away. Fails if the candidate trips a sandbox or timing violation
 * (check #11/#12). A fresh candidate seat is created so the match's match-start
 * runs from a clean state.
 */
async function runSmokeMatch(
    bytes: Uint8Array,
    deps: ValidationDeps,
    budget: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (deps.fillerSamples.length < 3) {
        throw new Error('validation requires at least 3 filler samples for the smoke match');
    }
    // Re-seat the candidate fresh for the match (the validation seat already ran
    // create()/metadata(); we want a clean instance for the match itself).
    const smokeCandidate = await createGardenerSeat(bytes, { id: 'candidate', callBudgetMs: budget });
    const fillers: GardenerSeat[] = [];
    for (const f of deps.fillerSamples.slice(0, 3)) {
        fillers.push(await createGardenerSeat(f.bytes, { id: f.id, callBudgetMs: budget }));
    }
    try {
        await runMatch({ matchId: 'smoke', seed: 'validation-smoke', seats: [smokeCandidate, ...fillers] });
        const bad = smokeCandidate.violations.filter((v) => v.kind === 'sandbox' || v.kind === 'timeout');
        if (bad.length > 0) {
            const v = bad[0]!;
            return { ok: false, reason: `Smoke match failed: ${v.kind} on ${v.phase} (${v.message}).` };
        }
        return { ok: true };
    } finally {
        smokeCandidate.dispose();
        for (const f of fillers) f.dispose();
    }
}
