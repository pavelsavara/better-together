// Scheduled tournament run (docs/architecture.md §4.1). One change-gated
// invocation: detect changed bots, and if any, seat ~budget matches against
// opponents weighted toward the under-sampled, drive each match, log it, carry
// VFS forward, recompute the leaderboard, and stage everything for one commit.
//
// jsco instantiation happens only for the player (gardener) components; the
// round resolution is the pure TS core. The OCI manifest check is injected.

import { readFile } from 'node:fs/promises';
import type { BotRecord, MatchLog, MatchLogRound, RegistryIndex } from './types.ts';
import { createGardenerSeat, type GardenerSeat } from './host/seat.ts';
import { runMatch } from './core/match.ts';
import { matchSeed } from './core/rng.ts';
import { computeScores, DEFAULT_SCORING, type ScoringConfig } from './core/scoring.ts';
import { generateRosters, type PoolBot } from './roster/generate.ts';
import { detectChanges, type ManifestChecker } from './scan/detect.ts';
import { type Vfs } from './host/vfs.ts';
import { loadIndex, loadRegistryState, loadRecentMatchLogs, loadVfs, loadMeta } from './store/read.ts';
import { writeIndex, writeScores, writeRegistryState, writeMatchLog, writeVfs, writeMeta } from './store/write.ts';
import { wasmPath } from './store/paths.ts';
import { emptyMeta, ENGINE_VERSION, INDEX_VERSION } from './store/schema.ts';
import { sha256Hex } from './validate/checks.ts';

export interface RunDeps {
    /** Store base directory (the checked-out gh-pages branch). */
    base: string;
    /** Conditional OCI manifest check (injected; stubbed in production for now). */
    check: ManifestChecker;
    /** Run-level master seed → per-match seeds. */
    masterSeed: string;
    /** Matches to run this invocation (~500, tunable). */
    budget?: number;
    scoring?: ScoringConfig;
    /** Per-seat wall-clock budget (0 disables; use 50 with a release jsco build). */
    callBudgetMs?: number;
    now?: () => string;
    runId?: string;
    /** Cap the run's wall-clock time (ms) so a tick fits inside its hour. */
    maxRunMs?: number;
    /** Resolve a bot's component bytes (defaults to the cached store wasm). */
    loadWasm?: (record: BotRecord) => Promise<Uint8Array>;
}

export interface RunResult {
    skipped: boolean;
    changed: string[];
    retired: string[];
    matchesRun: number;
    matchLogPaths: string[];
}

function defaultLoadWasm(base: string): (record: BotRecord) => Promise<Uint8Array> {
    return async (record) => {
        const bytes = new Uint8Array(await readFile(wasmPath(base, record.id, record.version)));
        // Provenance audit: the served bytes must match the sha256 pinned in the
        // index, so a tampered/wrong cache can't be seated (architecture §6).
        if (record.wasmSha256 && sha256Hex(bytes) !== record.wasmSha256) {
            throw new Error(`provenance mismatch for ${record.id}: served wasm sha256 != index pin`);
        }
        return bytes;
    };
}

/** Build a match log from a driver report + per-round outcomes. */
function buildMatchLog(
    matchId: string,
    seed: string,
    triggeredBy: string,
    players: string[],
    playerDigests: Record<string, string>,
    outcomes: Awaited<ReturnType<typeof runMatch>>['outcomes'],
    report: Awaited<ReturnType<typeof runMatch>>['report'],
): MatchLog {
    const rounds: MatchLogRound[] = outcomes.map((o) => ({
        round: o.round,
        signals: o.garden.actions.map((a) => ({ id: a.id, signal: a.signal })),
        plants: o.garden.actions.map((a) => ({ id: a.id, plant: a.plant, signal: a.signal })),
        votes: o.garden.votes.map((v) => ({ voter: v.voter, target: v.target })),
        gardenTotal: o.garden.gardenTotal,
        taxTarget: o.garden.taxTarget,
        taxCollected: o.garden.taxCollected,
        gardenPayout: o.garden.gardenPayout,
        roundScores: o.roundScores,
        runningTotals: o.runningTotals,
    }));
    return {
        matchId,
        seed,
        engineVersion: ENGINE_VERSION,
        triggeredBy,
        groupSize: report.groupSize,
        players,
        playerDigests,
        roundsPlayed: report.roundsPlayed,
        rounds,
        scores: report.scores,
        groupTotal: report.groupTotal,
    };
}

/**
 * Run one scheduled tournament tick. Returns `{ skipped: true }` (no writes) when
 * no bot changed; otherwise runs the matches and stages every file for one commit.
 */
export async function runTournament(deps: RunDeps): Promise<RunResult> {
    const base = deps.base;
    const now = deps.now?.() ?? new Date().toISOString();
    const runId = deps.runId ?? now.replace(/[:.]/g, '-');
    const budget = deps.budget ?? 500;
    const scoring = deps.scoring ?? DEFAULT_SCORING;
    const callBudgetMs = deps.callBudgetMs ?? 0;
    const loadWasm = deps.loadWasm ?? defaultLoadWasm(base);
    const when = new Date(now);

    const index = await loadIndex(base);
    const prevState = await loadRegistryState(base);
    const active = index.bots.filter((b) => b.status === 'active');

    const detect = await detectChanges(active, prevState, deps.check, now);
    if (detect.changed.length === 0) {
        return { skipped: true, changed: [], retired: [], matchesRun: 0, matchLogPaths: [] };
    }

    // Current windowed match counts (from existing logs) drive opponent weighting.
    const existingLogs = await loadRecentMatchLogs(base, scoring.windowPerBot * Math.max(active.length, 1));
    const windowCounts = new Map<string, number>();
    for (const log of existingLogs) {
        for (const s of log.scores) windowCounts.set(s.id, (windowCounts.get(s.id) ?? 0) + 1);
    }
    const pool: PoolBot[] = active.map((b) => ({ id: b.id, matchesInWindow: windowCounts.get(b.id) ?? 0 }));

    const rosters = generateRosters({ changed: detect.changed, pool, budget, seed: deps.masterSeed });

    // Carry each bot's VFS forward across the whole run (one Map per bot, reused).
    const byId = new Map(index.bots.map((b) => [b.id, b] as const));
    const vfsById = new Map<string, Vfs>();
    async function vfsFor(id: string): Promise<Vfs> {
        let v = vfsById.get(id);
        if (!v) {
            v = await loadVfs(base, id);
            vfsById.set(id, v);
        }
        return v;
    }

    const digestById = new Map<string, string | null>(Object.entries(detect.state.bots).map(([id, e]) => [id, e.digest]));
    const seatedThisRun = new Map<string, number>(); // id → matches played this run
    const wentInactive = new Set<string>();
    const newLogs: MatchLog[] = [];
    const matchLogPaths: string[] = [];
    const startedAt = Date.now();

    for (let m = 0; m < rosters.length; m++) {
        if (deps.maxRunMs && Date.now() - startedAt > deps.maxRunMs) break; // wall-time cap
        const roster = rosters[m]!;
        const triggeredBy = detect.changed[m % detect.changed.length]!;
        const seed = matchSeed(deps.masterSeed, m);

        const seats: GardenerSeat[] = [];
        try {
            for (const id of roster) {
                const record = byId.get(id);
                if (!record) continue;
                try {
                    const bytes = await loadWasm(record);
                    seats.push(await createGardenerSeat(bytes, { id, fs: await vfsFor(id), callBudgetMs }));
                } catch {
                    // A seat that fails to load (e.g. provenance mismatch) is
                    // skipped for this match rather than aborting the whole run.
                    continue;
                }
            }
            if (seats.length < 4) {
                // Not enough live seats: drop these bots' carried VFS so a failed
                // roster can't accumulate stale in-memory edits across the run.
                for (const id of roster) vfsById.delete(id);
                continue;
            }

            const { outcomes, report } = await runMatch({ matchId: `${now}-${String(m).padStart(4, '0')}`, seed, seats });

            const players = report.scores.map((s) => s.id);
            const playerDigests: Record<string, string> = {};
            for (const id of players) {
                const d = digestById.get(id);
                if (d) playerDigests[id] = d;
            }
            const log = buildMatchLog(report.matchId, seed, triggeredBy, players, playerDigests, outcomes, report);
            const path = await writeMatchLog(base, runId, log, when);
            matchLogPaths.push(path);
            newLogs.push(log);

            for (const id of players) seatedThisRun.set(id, (seatedThisRun.get(id) ?? 0) + 1);
            for (const seat of seats) {
                if (seat.status === 'inactive') wentInactive.add(seat.id);
            }
        } finally {
            for (const seat of seats) seat.dispose();
        }
    }

    // Persist each seated bot's carried-forward VFS (quota enforced → erase on overflow).
    for (const [id, vfs] of vfsById) {
        await writeVfs(base, id, vfs);
    }

    // Update the index: mark inactive bots, bump matchesSinceUpdate, and for the
    // changed bots stamp lastDigestChangeAt + reset their since-update counter.
    const changedSet = new Set(detect.changed);
    const retiredSet = new Set(detect.retired);
    const updatedBots: BotRecord[] = index.bots.map((b) => {
        const played = seatedThisRun.get(b.id) ?? 0;
        let rec = b;
        if (changedSet.has(b.id)) {
            rec = { ...rec, lastDigestChangeAt: now, matchesSinceUpdate: played };
        } else if (played > 0) {
            rec = { ...rec, matchesSinceUpdate: rec.matchesSinceUpdate + played };
        }
        if (wentInactive.has(b.id) && rec.status === 'active') {
            rec = { ...rec, status: 'inactive' };
        }
        if (retiredSet.has(b.id) && rec.status === 'active') {
            rec = { ...rec, status: 'retired' };
        }
        return rec;
    });
    const newIndex: RegistryIndex = { version: INDEX_VERSION, updated: now, bots: updatedBots };
    await writeIndex(base, newIndex);

    // Recompute the leaderboard over existing + new logs.
    const scores = computeScores([...existingLogs, ...newLogs], scoring, now);
    await writeScores(base, scores);

    await writeRegistryState(base, detect.state);

    const prevMeta = (await loadMeta(base)) ?? emptyMeta(now);
    await writeMeta(base, {
        version: prevMeta.version,
        engineVersion: ENGINE_VERSION,
        updated: now,
        totalMatches: prevMeta.totalMatches + newLogs.length,
        totalRuns: prevMeta.totalRuns + 1,
        notes: `tuning: budget=${budget}, windowPerBot=${scoring.windowPerBot}, minMatchesToRank=${scoring.minMatchesToRank}`,
    });

    return { skipped: false, changed: detect.changed, retired: detect.retired, matchesRun: newLogs.length, matchLogPaths };
}
