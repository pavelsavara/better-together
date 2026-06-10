// Store schemas: validation + deterministic (de)serialization.
//
// Every JSON artifact on the gh-pages branch (docs/architecture.md §2) is read
// and written through here so the store stays minimal-diff: keys are emitted in
// a stable (recursively sorted) order with 2-space indentation and a trailing
// newline. Parsing validates shape/range and throws a StoreValidationError on
// anything malformed, so a corrupt file fails loudly rather than silently
// poisoning the tournament.

import type {
    RegistryIndex,
    BotRecord,
    BotStatus,
    Scores,
    ScoreRow,
    RegistryState,
    TournamentMeta,
    MatchLog,
} from '../types.ts';

export const INDEX_VERSION = 1;
export const SCORES_VERSION = 1;
export const REGISTRY_STATE_VERSION = 1;
export const META_VERSION = 1;
export const ENGINE_VERSION = '0.1.0';

const BOT_STATUSES: ReadonlySet<string> = new Set(['active', 'inactive', 'retired', 'rejected']);

export class StoreValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StoreValidationError';
    }
}

function fail(message: string): never {
    throw new StoreValidationError(message);
}

// --- primitive guards ------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(v: unknown, where: string): string {
    if (typeof v !== 'string') fail(`${where} must be a string`);
    return v;
}
function strOrNull(v: unknown, where: string): string | null {
    if (v === null) return null;
    if (typeof v !== 'string') fail(`${where} must be a string or null`);
    return v;
}
function num(v: unknown, where: string): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where} must be a finite number`);
    return v;
}
function numOrNull(v: unknown, where: string): number | null {
    if (v === null) return null;
    return num(v, where);
}
function bool(v: unknown, where: string): boolean {
    if (typeof v !== 'boolean') fail(`${where} must be a boolean`);
    return v;
}
function arr(v: unknown, where: string): unknown[] {
    if (!Array.isArray(v)) fail(`${where} must be an array`);
    return v;
}

// --- deterministic serialization -------------------------------------------

/** Recursively sort object keys so the serialized form is stable (minimal diff). */
function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (isObject(value)) {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
        return out;
    }
    return value;
}

/** Stable JSON: sorted keys, 2-space indent, trailing newline. */
export function stableStringify(value: unknown): string {
    return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

// --- index.json ------------------------------------------------------------

function parseBotRecord(v: unknown, i: number): BotRecord {
    if (!isObject(v)) fail(`bots[${i}] must be an object`);
    const status = str(v.status, `bots[${i}].status`);
    if (!BOT_STATUSES.has(status)) fail(`bots[${i}].status invalid: ${status}`);
    return {
        id: str(v.id, `bots[${i}].id`),
        name: str(v.name, `bots[${i}].name`),
        namespace: str(v.namespace, `bots[${i}].namespace`),
        shortName: str(v.shortName, `bots[${i}].shortName`),
        version: str(v.version, `bots[${i}].version`),
        author: str(v.author, `bots[${i}].author`),
        repo: str(v.repo, `bots[${i}].repo`),
        lore: str(v.lore, `bots[${i}].lore`),
        glyph: str(v.glyph, `bots[${i}].glyph`),
        icon: strOrNull(v.icon, `bots[${i}].icon`),
        iconSource: strOrNull(v.iconSource, `bots[${i}].iconSource`),
        oci: str(v.oci, `bots[${i}].oci`),
        ociDigest: strOrNull(v.ociDigest, `bots[${i}].ociDigest`),
        ociEtag: strOrNull(v.ociEtag, `bots[${i}].ociEtag`),
        wasm: str(v.wasm, `bots[${i}].wasm`),
        wasmSha256: str(v.wasmSha256, `bots[${i}].wasmSha256`),
        submittedBy: str(v.submittedBy, `bots[${i}].submittedBy`),
        approvedBy: str(v.approvedBy, `bots[${i}].approvedBy`),
        issue: num(v.issue, `bots[${i}].issue`),
        validatedAt: str(v.validatedAt, `bots[${i}].validatedAt`),
        lastDigestChangeAt: str(v.lastDigestChangeAt, `bots[${i}].lastDigestChangeAt`),
        matchesSinceUpdate: num(v.matchesSinceUpdate, `bots[${i}].matchesSinceUpdate`),
        status: status as BotStatus,
    };
}

export function parseRegistryIndex(json: string): RegistryIndex {
    const v: unknown = JSON.parse(json);
    if (!isObject(v)) fail('index must be an object');
    return {
        version: num(v.version, 'index.version'),
        updated: str(v.updated, 'index.updated'),
        bots: arr(v.bots, 'index.bots').map(parseBotRecord),
    };
}

export function serializeRegistryIndex(index: RegistryIndex): string {
    return stableStringify(index);
}

export function emptyRegistryIndex(now = new Date().toISOString()): RegistryIndex {
    return { version: INDEX_VERSION, updated: now, bots: [] };
}

// --- scores.json -----------------------------------------------------------

function parseScoreRow(v: unknown, i: number): ScoreRow {
    if (!isObject(v)) fail(`leaderboard[${i}] must be an object`);
    return {
        id: str(v.id, `leaderboard[${i}].id`),
        rank: numOrNull(v.rank, `leaderboard[${i}].rank`),
        ranked: bool(v.ranked, `leaderboard[${i}].ranked`),
        coPlayerScore: num(v.coPlayerScore, `leaderboard[${i}].coPlayerScore`),
        coPlayerStdErr: num(v.coPlayerStdErr, `leaderboard[${i}].coPlayerStdErr`),
        rawScore: num(v.rawScore, `leaderboard[${i}].rawScore`),
        consistencyStd: num(v.consistencyStd, `leaderboard[${i}].consistencyStd`),
        matchesInWindow: num(v.matchesInWindow, `leaderboard[${i}].matchesInWindow`),
    };
}

export function parseScores(json: string): Scores {
    const v: unknown = JSON.parse(json);
    if (!isObject(v)) fail('scores must be an object');
    if (!isObject(v.window)) fail('scores.window must be an object');
    return {
        version: num(v.version, 'scores.version'),
        computedAt: str(v.computedAt, 'scores.computedAt'),
        window: { matchesPerBot: num(v.window.matchesPerBot, 'scores.window.matchesPerBot') },
        minMatchesToRank: num(v.minMatchesToRank, 'scores.minMatchesToRank'),
        baselineMeanGroupTotal: num(v.baselineMeanGroupTotal, 'scores.baselineMeanGroupTotal'),
        leaderboard: arr(v.leaderboard, 'scores.leaderboard').map(parseScoreRow),
    };
}

export function serializeScores(scores: Scores): string {
    return stableStringify(scores);
}

// --- registry-state.json ---------------------------------------------------

export function parseRegistryState(json: string): RegistryState {
    const v: unknown = JSON.parse(json);
    if (!isObject(v)) fail('registry-state must be an object');
    if (!isObject(v.bots)) fail('registry-state.bots must be an object');
    const bots: RegistryState['bots'] = {};
    for (const [id, entry] of Object.entries(v.bots)) {
        if (!isObject(entry)) fail(`registry-state.bots[${id}] must be an object`);
        bots[id] = {
            oci: str(entry.oci, `registry-state.bots[${id}].oci`),
            digest: strOrNull(entry.digest, `registry-state.bots[${id}].digest`),
            etag: strOrNull(entry.etag, `registry-state.bots[${id}].etag`),
        };
    }
    return {
        version: num(v.version, 'registry-state.version'),
        checkedAt: str(v.checkedAt, 'registry-state.checkedAt'),
        bots,
    };
}

export function serializeRegistryState(state: RegistryState): string {
    return stableStringify(state);
}

export function emptyRegistryState(now = new Date().toISOString()): RegistryState {
    return { version: REGISTRY_STATE_VERSION, checkedAt: now, bots: {} };
}

// --- meta.json -------------------------------------------------------------

export function parseMeta(json: string): TournamentMeta {
    const v: unknown = JSON.parse(json);
    if (!isObject(v)) fail('meta must be an object');
    return {
        version: num(v.version, 'meta.version'),
        engineVersion: str(v.engineVersion, 'meta.engineVersion'),
        updated: str(v.updated, 'meta.updated'),
        totalMatches: num(v.totalMatches, 'meta.totalMatches'),
        totalRuns: num(v.totalRuns, 'meta.totalRuns'),
        ...(v.notes !== undefined ? { notes: str(v.notes, 'meta.notes') } : {}),
    };
}

export function serializeMeta(meta: TournamentMeta): string {
    return stableStringify(meta);
}

export function emptyMeta(now = new Date().toISOString()): TournamentMeta {
    return { version: META_VERSION, engineVersion: ENGINE_VERSION, updated: now, totalMatches: 0, totalRuns: 0 };
}

// --- match log -------------------------------------------------------------

export function parseMatchLog(json: string): MatchLog {
    const v: unknown = JSON.parse(json);
    if (!isObject(v)) fail('match log must be an object');
    const players = arr(v.players, 'matchLog.players').map((p, i) => str(p, `matchLog.players[${i}]`));
    if (!isObject(v.playerDigests)) fail('matchLog.playerDigests must be an object');
    const playerDigests: Record<string, string> = {};
    for (const [id, d] of Object.entries(v.playerDigests)) playerDigests[id] = str(d, `matchLog.playerDigests[${id}]`);
    const scores = arr(v.scores, 'matchLog.scores').map((s, i) => {
        if (!isObject(s)) fail(`matchLog.scores[${i}] must be an object`);
        return { id: str(s.id, `matchLog.scores[${i}].id`), matchScore: num(s.matchScore, `matchLog.scores[${i}].matchScore`) };
    });
    // rounds are large but structurally regular; keep them as-is after a light check.
    const rounds = arr(v.rounds, 'matchLog.rounds') as MatchLog['rounds'];
    return {
        matchId: str(v.matchId, 'matchLog.matchId'),
        seed: str(v.seed, 'matchLog.seed'),
        engineVersion: str(v.engineVersion, 'matchLog.engineVersion'),
        triggeredBy: str(v.triggeredBy, 'matchLog.triggeredBy'),
        groupSize: num(v.groupSize, 'matchLog.groupSize'),
        players,
        playerDigests,
        roundsPlayed: num(v.roundsPlayed, 'matchLog.roundsPlayed'),
        rounds,
        scores,
        groupTotal: num(v.groupTotal, 'matchLog.groupTotal'),
    };
}

export function serializeMatchLog(log: MatchLog): string {
    return stableStringify(log);
}
