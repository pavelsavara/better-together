// The sandboxed seat wrapper (docs/architecture.md §4.2, §6).
//
// Instantiates a gardener component via jsco, creates one seated player, and
// exposes it as the framework-agnostic `Seat` the match driver drives. Each call
// is guarded by a wall-clock watchdog (50 ms default) and a try/catch: a trap or
// timeout fails ONLY that call (the driver substitutes the documented default),
// but a timing violation or a sandbox-capability breach additionally marks the
// bot `inactive` so the host drops it from future rosters.

import type { Seat, Metadata, MatchContext, RoundState, MatchSummary, Signal, Ballot } from '../types.ts';
import {
    getInstantiate,
    unwrapResult,
    DEFAULT_ENABLED,
    type JscoHostConfig,
    type JscoInstance,
} from './jsco.ts';
import { VFS_BYTE_CAP, type Vfs } from './vfs.ts';

/** Why a seat call was rejected. */
export type ViolationKind = 'timeout' | 'sandbox' | 'trap';

export interface SeatViolation {
    kind: ViolationKind;
    phase: string;
    message: string;
    elapsedMs?: number;
}

export interface GardenerSeat extends Seat {
    /** active until a timing/sandbox violation flips it to inactive. */
    readonly status: 'active' | 'inactive';
    /** Recorded violations (timing/sandbox/trap) for host enforcement + logging. */
    readonly violations: readonly SeatViolation[];
    /** Captured stdout (folded into banter). */
    stdout(): string;
    /** Captured stderr (engine diagnostics only — never shown as banter). */
    stderr(): string;
    /** The live in-memory VFS (carried forward across a run, persisted after). */
    readonly fs: Vfs;
    readonly metadata: () => Metadata;
    dispose(): void;
}

export interface SeatOptions {
    /** Seat id; defaults to metadata.name. The host passes the manufactured id. */
    id?: string;
    /** Initial VFS (seeded from vfs/<id>/). Defaults to an empty Map. */
    fs?: Vfs;
    env?: Array<[string, string]>;
    enabledInterfaces?: readonly string[];
    /** Per-call wall-clock budget in ms (50 by default; <= 0 disables the timer). */
    callBudgetMs?: number;
    /** VFS byte quota handed to jsco (defaults to the 256 KB cap). */
    maxVfsBytes?: number;
    /** Extra HostConfig fields (e.g. a seeded random source). */
    config?: Partial<JscoHostConfig>;
}

/** Matches the host errors jsco raises when a denied capability is touched. */
const SANDBOX_RE = /wasi:sockets|wasi:http|disabled|network|sockets|http/i;

export class TimeoutError extends Error {
    constructor(phase: string, budgetMs: number) {
        super(`${phase} exceeded the ${budgetMs} ms budget`);
        this.name = 'TimeoutError';
    }
}

/** Classify a failed (or slow) seat call into a violation kind. */
export function classifyError(e: unknown): ViolationKind {
    if (e instanceof TimeoutError) return 'timeout';
    const msg = String((e as Error)?.message ?? e);
    return SANDBOX_RE.test(msg) ? 'sandbox' : 'trap';
}

/**
 * Run one seat call under a wall-clock watchdog. Resolves with the value and the
 * measured elapsed time. THROWS a TimeoutError if the call exceeds `budgetMs` —
 * whether it overran the timer or merely completed late — so the caller can
 * substitute the default and mark the seat inactive. A budget <= 0 disables the
 * timer (the call is awaited with no bound), used for the slow debug jsco build.
 */
export async function withWatchdog<T>(
    phase: string,
    budgetMs: number,
    invoke: () => Promise<T> | T,
): Promise<{ value: T; elapsedMs: number }> {
    const started = performance.now();
    if (budgetMs <= 0) {
        const value = await invoke();
        return { value, elapsedMs: performance.now() - started };
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const call = Promise.resolve().then(invoke);
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(phase, budgetMs)), budgetMs);
    });
    try {
        const value = await Promise.race([call, timeout]);
        const elapsedMs = performance.now() - started;
        if (elapsedMs > budgetMs) throw new TimeoutError(phase, budgetMs);
        return { value: value as T, elapsedMs };
    } finally {
        if (timer) clearTimeout(timer);
        call.catch(() => { }); // swallow a late rejection from the losing call
    }
}

function collectStream(chunks: Uint8Array[]): WritableStream {
    return new WritableStream({
        write(chunk) {
            chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        },
    });
}

function decodeChunks(chunks: Uint8Array[]): string {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return new TextDecoder().decode(out);
}

/** Resolve a player export function by its kebab name (free-function form). */
function resolveFn(player: Record<string, unknown>, kebab: string): (...args: unknown[]) => unknown {
    const direct = player[kebab];
    const method = player[`[method]gardener.${kebab.replace(/^gardener-/, '')}`];
    const fn = (direct ?? method) as ((...args: unknown[]) => unknown) | undefined;
    if (typeof fn !== 'function') {
        throw new Error(`gardener missing export "${kebab}"`);
    }
    return fn;
}

/**
 * Instantiate a gardener component and seat one player. The returned seat
 * implements the `Seat` interface and additionally exposes status/violations,
 * captured stdio, and its VFS for host-side enforcement and persistence.
 */
export async function createGardenerSeat(bytes: Uint8Array, opts: SeatOptions = {}): Promise<GardenerSeat> {
    const instantiate = await getInstantiate();

    const fs: Vfs = opts.fs ?? new Map();
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    const budgetMs = opts.callBudgetMs ?? 50;

    const config: JscoHostConfig = {
        fs,
        stdout: collectStream(stdoutChunks),
        stderr: collectStream(stderrChunks),
        env: opts.env ?? [],
        enabledInterfaces: [...(opts.enabledInterfaces ?? DEFAULT_ENABLED)],
        limits: { maxVfsBytes: opts.maxVfsBytes ?? VFS_BYTE_CAP },
        ...(opts.config ?? {}),
    };

    const instance: JscoInstance = await instantiate(bytes, config);
    const playerKey = Object.keys(instance.exports).find((k) => k.includes('gardener/player'));
    if (!playerKey) {
        instance.dispose();
        throw new Error(`component does not export gardener/player; exports: ${Object.keys(instance.exports).join(', ')}`);
    }
    const player = instance.exports[playerKey]!;

    // From here on, any failure must tear the instance down so we never leak a
    // live wasm instance (its memory + resource handles).
    try {
        const handle = unwrapResult<number>(await resolveFn(player, 'create')(), 'create');
        const rawMeta = unwrapResult<Record<string, unknown>>(
            await resolveFn(player, 'gardener-metadata')(handle),
            'metadata',
        );
        const metadata: Metadata = {
            name: String(rawMeta.name ?? ''),
            version: String(rawMeta.version ?? ''),
            author: String(rawMeta.author ?? ''),
            repo: String(rawMeta.repo ?? ''),
            lore: String(rawMeta.lore ?? ''),
            glyph: String(rawMeta.glyph ?? ''),
            icon: rawMeta.icon == null ? null : String(rawMeta.icon),
        };
        const id = opts.id ?? metadata.name;

        const fnTalk = resolveFn(player, 'gardener-talk');
        const fnPlant = resolveFn(player, 'gardener-plant');
        const fnVote = resolveFn(player, 'gardener-vote');
        const fnStart = resolveFn(player, 'gardener-match-start');
        const fnEnd = resolveFn(player, 'gardener-match-end');

        let status: 'active' | 'inactive' = 'active';
        const violations: SeatViolation[] = [];

        function record(kind: ViolationKind, phase: string, message: string, elapsedMs?: number) {
            violations.push({ kind, phase, message, ...(elapsedMs !== undefined ? { elapsedMs } : {}) });
            if (kind === 'timeout' || kind === 'sandbox') status = 'inactive';
        }

        /**
         * Run one seat call under the watchdog. Resolves with the value or THROWS so
         * the driver substitutes the default. Classifies failures: a timeout or a
         * sandbox-capability breach marks the seat inactive; a plain trap does not.
         */
        async function guard<T>(phase: string, invoke: () => Promise<T> | T): Promise<T> {
            const started = performance.now();
            try {
                const { value } = await withWatchdog(phase, budgetMs, invoke);
                return value;
            } catch (e) {
                const kind = classifyError(e);
                record(kind, phase, String((e as Error)?.message ?? e), performance.now() - started);
                throw e;
            }
        }

        return {
            id,
            get status() {
                return status;
            },
            get violations() {
                return violations;
            },
            fs,
            stdout: () => decodeChunks(stdoutChunks),
            stderr: () => decodeChunks(stderrChunks),
            metadata: () => metadata,
            async matchStart(context: MatchContext): Promise<void> {
                await guard('matchStart', () => unwrapResult(fnStart(handle, context), 'match-start'));
            },
            async talk(state: RoundState): Promise<Signal> {
                return await guard('talk', () => unwrapResult<Signal>(fnTalk(handle, state), 'talk'));
            },
            async plant(state: RoundState): Promise<number> {
                return await guard('plant', () => unwrapResult<number>(fnPlant(handle, state), 'plant'));
            },
            async vote(state: RoundState): Promise<Ballot> {
                const v = await guard<unknown>('vote', () => unwrapResult(fnVote(handle, state), 'vote'));
                return (typeof v === 'string' ? v : null) as Ballot;
            },
            async matchEnd(summary: MatchSummary): Promise<void> {
                await guard('matchEnd', () => unwrapResult(fnEnd(handle, summary), 'match-end'));
            },
            dispose() {
                instance.dispose();
            },
        };
    } catch (e) {
        instance.dispose();
        throw e;
    }
}
