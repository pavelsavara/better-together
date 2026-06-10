// Shared type contracts for the Better Together tournament.
//
// The game-contract types mirror wit/gardener.wit and wit/game.wit (camelCased,
// matching the jsco binding shape). The store types mirror the JSON data store
// described in docs/architecture.md §2. This module is framework-agnostic so it
// can be consumed unchanged by both game/ (Node) and web/ (browser).

// ---------------------------------------------------------------------------
// Game contracts (wit/gardener.wit :: types, wit/game.wit)
// ---------------------------------------------------------------------------

export type PlayerId = string;

/** The public broadcast a player emits each round (cheap talk). */
export type Signal = 'bloom' | 'hold' | 'watch';

/** A tax-phase ballot: the id to tax, or null to abstain. */
export type Ballot = PlayerId | null;

/** A player component's self-description (wit: metadata). */
export interface Metadata {
    /** Fully-qualified identity as `namespace.name`. */
    name: string;
    version: string;
    author: string;
    repo: string;
    lore: string;
    /** A single UTF character / emoji shown in the garden. */
    glyph: string;
    /** Avatar picture URL, or null when the player has no avatar. */
    icon: string | null;
}

/** What a single player did in a given round, revealed to everyone. */
export interface PlayerAction {
    id: PlayerId;
    /** Seeds planted in the shared garden this round, 0-10. */
    plant: number;
    signal: Signal;
}

/** One player's ballot in the vote phase. */
export interface VoteRecord {
    voter: PlayerId;
    target: PlayerId | null;
}

/** The fully resolved outcome of one round, broadcast to all players. */
export interface RoundResult {
    /** One entry per player (plant + signal this round). */
    actions: PlayerAction[];
    /** Sum of every player's plant, BEFORE the tax. */
    gardenTotal: number;
    /** Every ballot cast this round. */
    votes: VoteRecord[];
    /** The taxed player, or null when no tax. */
    taxTarget: PlayerId | null;
    /** Seeds reclaimed from the tax-target into the garden (0 when no tax). */
    taxCollected: number;
    /** ((gardenTotal + taxCollected) * 2) / groupSize, paid to every player. */
    gardenPayout: number;
}

/** Delivered once at the start of a match, before any rounds. */
export interface MatchContext {
    matchId: string;
    players: PlayerId[];
    selfId: PlayerId;
    /** Group size K (4-6). The round count R is intentionally hidden. */
    groupSize: number;
}

/** One player's broadcast for the current round (talk phase). */
export interface SignalBroadcast {
    id: PlayerId;
    signal: Signal;
}

/** Delivered to talk, plant, and vote each round. R is never revealed. */
export interface RoundState {
    /** 1-based index of the round about to be played. */
    round: number;
    /** Every previous round of this match, oldest first. */
    history: RoundResult[];
    /** This round's broadcasts (empty in talk). */
    signals: SignalBroadcast[];
    /** This round's plants (populated only in vote). */
    plants: PlayerAction[];
}

/** Delivered once when the match ends. */
export interface MatchSummary {
    roundsPlayed: number;
    finalScores: Array<[PlayerId, number]>;
    yourScore: number;
}

/** One player's outcome in a single match (wit: tournament.player-score). */
export interface PlayerScore {
    id: PlayerId;
    matchScore: number;
}

/** The fully resolved outcome of one match (wit: tournament.match-report). */
export interface MatchReport {
    matchId: string;
    groupSize: number;
    roundsPlayed: number;
    scores: PlayerScore[];
    /** Sum of every player's matchScore — the coalition value. */
    groupTotal: number;
}

/** The resolved outcome of one round (wit: runner.round-outcome). */
export interface RoundOutcome {
    round: number;
    garden: RoundResult;
    /** Each seat's score for THIS round, in seat order. */
    roundScores: number[];
    /** Each seat's cumulative match score so far, in seat order. */
    runningTotals: number[];
    /** True when this was the final round. */
    matchOver: boolean;
}

/** Match info returned at match-start (wit: runner.match-info — R hidden). */
export interface MatchInfo {
    matchId: string;
    players: PlayerId[];
    groupSize: number;
}

/**
 * The framework-agnostic player abstraction the match driver talks to. A real
 * gardener (jsco-instantiated) or a mock both implement this. Every method may
 * be sync or async; the driver always awaits.
 */
export interface Seat {
    readonly id: PlayerId;
    metadata(): Promise<Metadata> | Metadata;
    matchStart(context: MatchContext): Promise<void> | void;
    talk(state: RoundState): Promise<Signal> | Signal;
    plant(state: RoundState): Promise<number> | number;
    vote(state: RoundState): Promise<Ballot> | Ballot;
    matchEnd(summary: MatchSummary): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Data store (docs/architecture.md §2) — JSON committed to gh-pages
// ---------------------------------------------------------------------------

export type BotStatus = 'active' | 'inactive' | 'retired' | 'rejected';

/** One registry entry in data/index.json (architecture §2.1). */
export interface BotRecord {
    /** Manufactured in-game id: fnv1a32(oci) + "#" + namespace.Name. */
    id: string;
    /** metadata.name (namespace.name). */
    name: string;
    namespace: string;
    /** The segment after the dot. */
    shortName: string;
    version: string;
    author: string;
    repo: string;
    lore: string;
    glyph: string;
    /** Cached 100x100 PNG path, or null. */
    icon: string | null;
    /** Original metadata.icon URL, or null. */
    iconSource: string | null;
    /** Provenance — the OCI ref the bot was admitted from. */
    oci: string;
    /** Current manifest digest (change detection). */
    ociDigest: string | null;
    /** Last manifest ETag, or null. */
    ociEtag: string | null;
    /** Same-origin cached wasm path. */
    wasm: string;
    wasmSha256: string;
    submittedBy: string;
    approvedBy: string;
    issue: number;
    validatedAt: string;
    lastDigestChangeAt: string;
    matchesSinceUpdate: number;
    status: BotStatus;
}

/** data/index.json (architecture §2.1). */
export interface RegistryIndex {
    version: number;
    updated: string;
    bots: BotRecord[];
}

/** One leaderboard row in data/scores.json (architecture §2.2). */
export interface ScoreRow {
    id: string;
    /** null while unranked. */
    rank: number | null;
    /** false until the bot has >= minMatchesToRank matches. */
    ranked: boolean;
    coPlayerScore: number;
    coPlayerStdErr: number;
    rawScore: number;
    consistencyStd: number;
    matchesInWindow: number;
}

/** data/scores.json (architecture §2.2). */
export interface Scores {
    version: number;
    computedAt: string;
    window: { matchesPerBot: number };
    minMatchesToRank: number;
    baselineMeanGroupTotal: number;
    leaderboard: ScoreRow[];
}

/** Per-round entry inside a match log (architecture §2.3). */
export interface MatchLogRound {
    round: number;
    signals: Array<{ id: PlayerId; signal: Signal }>;
    plants: Array<{ id: PlayerId; plant: number; signal: Signal }>;
    votes: Array<{ voter: PlayerId; target: PlayerId | null }>;
    gardenTotal: number;
    taxTarget: PlayerId | null;
    taxCollected: number;
    gardenPayout: number;
    roundScores: number[];
    runningTotals: number[];
}

/** matches/.../<matchId>.json (architecture §2.3). */
export interface MatchLog {
    matchId: string;
    seed: string;
    engineVersion: string;
    triggeredBy: string;
    groupSize: number;
    players: PlayerId[];
    playerDigests: Record<PlayerId, string>;
    roundsPlayed: number;
    rounds: MatchLogRound[];
    scores: PlayerScore[];
    groupTotal: number;
}

/** Per-bot OCI change-detection cache (architecture §2.4). */
export interface RegistryState {
    version: number;
    checkedAt: string;
    bots: Record<string, { oci: string; digest: string | null; etag: string | null }>;
}

/** data/meta.json — tournament metadata (architecture §2). */
export interface TournamentMeta {
    version: number;
    engineVersion: string;
    updated: string;
    totalMatches: number;
    totalRuns: number;
    notes?: string;
}
