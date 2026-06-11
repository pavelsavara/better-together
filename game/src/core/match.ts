// The stepped match driver (docs/engine-rules.md §3, wit/game.wit :: runner).
//
// Mirrors the `match` resource: the host OPENS a match, then advances it one
// phase at a time — matchStart, then talk + plant + vote per round, then
// matchEnd. The driver owns the round count R (hidden) and the running totals;
// it validates every seat response and substitutes a default on a bad/trapped
// call. Framework-agnostic: seats may be jsco-backed or mocks.

import type {
    Seat,
    Signal,
    Ballot,
    PlayerId,
    RoundState,
    RoundResult,
    RoundOutcome,
    MatchInfo,
    MatchReport,
    PlayerScore,
    SignalBroadcast,
    PlayerAction,
    MatchContext,
    MatchSummary,
} from '../types.ts';
import { Rng, rollRoundCount } from './rng.ts';
import { resolveRound, type RoundInput, ENDOWMENT } from './resolve.ts';

const VALID_SIGNALS: ReadonlySet<string> = new Set(['bloom', 'hold', 'watch']);

/** Default substituted when a seat traps / times out / returns garbage. */
const DEFAULT_SIGNAL: Signal = 'watch';
const DEFAULT_PLANT = 0;
const DEFAULT_VOTE: Ballot = null;

/** Coerce a seat's talk response to a valid signal (default WATCH). */
export function validateSignal(value: unknown): Signal {
    return typeof value === 'string' && VALID_SIGNALS.has(value) ? (value as Signal) : DEFAULT_SIGNAL;
}

/** Coerce a seat's plant response to an integer 0-10 (out-of-range clamped). */
export function validatePlant(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PLANT;
    const n = Math.trunc(value);
    if (n < 0) return 0;
    if (n > ENDOWMENT) return ENDOWMENT;
    return n;
}

/** Coerce a seat's vote response to a valid in-match ballot (default abstain). */
export function validateVote(value: unknown, playerIds: ReadonlySet<PlayerId>): Ballot {
    if (typeof value !== 'string') return DEFAULT_VOTE;
    return playerIds.has(value) ? value : DEFAULT_VOTE;
}

/** Phases of the per-round state machine, enforced by the driver. */
type Phase = 'idle' | 'talk' | 'plant' | 'vote' | 'ended';

/** Hooks so a host can observe/enforce per-seat calls (timing, sandbox). */
export interface SeatCallHooks {
    /**
     * Wrap a single seat call. Should return the seat's value, or throw to force
     * the default. Receives the seat, the phase, and the underlying invocation.
     */
    onCall?<T>(seat: Seat, phase: 'talk' | 'plant' | 'vote' | 'matchStart' | 'matchEnd', invoke: () => Promise<T> | T): Promise<T>;
}

export interface MatchDriverOptions {
    matchId: string;
    seed: string;
    /** Provide seats in any order; the driver shuffles them deterministically. */
    seats: readonly Seat[];
    hooks?: SeatCallHooks;
}

/**
 * Open a stepped match driver. The caller drives the loop:
 *   const m = createMatchDriver(opts);
 *   await m.matchStart();
 *   while (!over) { await m.talk(); await m.plant(); const o = await m.vote(); over = o.matchOver; }
 *   const report = await m.matchEnd();
 */
export function createMatchDriver(opts: MatchDriverOptions) {
    const rng = new Rng(opts.seed);
    // Seat order is part of the seeded randomness (§4.5).
    const seats = rng.shuffle(opts.seats);
    const groupSize = seats.length;
    const players: PlayerId[] = seats.map((s) => s.id);
    const playerIdSet = new Set(players);
    const totalRounds = rollRoundCount(rng);

    const history: RoundResult[] = [];
    const runningTotals: number[] = seats.map(() => 0);

    let phase: Phase = 'idle';
    let round = 0;
    let currentSignals: SignalBroadcast[] = [];
    let currentPlants: PlayerAction[] = [];

    const hooks = opts.hooks;

    async function callSeat<T>(
        seat: Seat,
        ph: 'talk' | 'plant' | 'vote' | 'matchStart' | 'matchEnd',
        invoke: () => Promise<T> | T,
        fallback: T,
    ): Promise<T> {
        try {
            if (hooks?.onCall) return await hooks.onCall(seat, ph, invoke);
            return await invoke();
        } catch {
            return fallback;
        }
    }

    function stateForTalk(): RoundState {
        return { round, history: history.slice(), signals: [], plants: [] };
    }
    function stateForPlant(): RoundState {
        return { round, history: history.slice(), signals: currentSignals.slice(), plants: [] };
    }
    function stateForVote(): RoundState {
        return { round, history: history.slice(), signals: currentSignals.slice(), plants: currentPlants.slice() };
    }

    return {
        get matchId() {
            return opts.matchId;
        },
        get seed() {
            return opts.seed;
        },
        get groupSize() {
            return groupSize;
        },
        get players() {
            return players.slice();
        },
        /** Total rounds R — internal/testing only; never surfaced to seats. */
        get _totalRounds() {
            return totalRounds;
        },

        async matchStart(): Promise<MatchInfo> {
            if (phase !== 'idle') throw new Error('matchStart already called');
            const context: MatchContext = { matchId: opts.matchId, players: players.slice(), selfId: '', groupSize };
            await Promise.all(
                seats.map((seat) =>
                    callSeat(seat, 'matchStart', () => seat.matchStart({ ...context, selfId: seat.id }), undefined),
                ),
            );
            phase = 'talk';
            round = 1;
            return { matchId: opts.matchId, players: players.slice(), groupSize };
        },

        async talk(): Promise<SignalBroadcast[]> {
            if (phase !== 'talk') throw new Error(`talk() out of phase: ${phase}`);
            const state = stateForTalk();
            const signals = await Promise.all(
                seats.map(async (seat) => {
                    const raw = await callSeat(seat, 'talk', () => seat.talk(state), DEFAULT_SIGNAL);
                    return { id: seat.id, signal: validateSignal(raw) } as SignalBroadcast;
                }),
            );
            currentSignals = signals;
            phase = 'plant';
            return signals.slice();
        },

        async plant(): Promise<PlayerAction[]> {
            if (phase !== 'plant') throw new Error(`plant() out of phase: ${phase}`);
            const state = stateForPlant();
            const signalById = new Map(currentSignals.map((s) => [s.id, s.signal] as const));
            const plants = await Promise.all(
                seats.map(async (seat) => {
                    const raw = await callSeat(seat, 'plant', () => seat.plant(state), DEFAULT_PLANT);
                    return {
                        id: seat.id,
                        plant: validatePlant(raw),
                        signal: signalById.get(seat.id) ?? DEFAULT_SIGNAL,
                    } as PlayerAction;
                }),
            );
            currentPlants = plants;
            phase = 'vote';
            return plants.slice();
        },

        async vote(): Promise<RoundOutcome> {
            if (phase !== 'vote') throw new Error(`vote() out of phase: ${phase}`);
            const state = stateForVote();
            const ballots = await Promise.all(
                seats.map(async (seat) => {
                    const raw = await callSeat(seat, 'vote', () => seat.vote(state), DEFAULT_VOTE);
                    return validateVote(raw, playerIdSet);
                }),
            );

            const signalById = new Map(currentSignals.map((s) => [s.id, s.signal] as const));
            const plantById = new Map(currentPlants.map((p) => [p.id, p.plant] as const));
            const inputs: RoundInput[] = seats.map((seat, i) => ({
                id: seat.id,
                plant: plantById.get(seat.id) ?? DEFAULT_PLANT,
                signal: signalById.get(seat.id) ?? DEFAULT_SIGNAL,
                vote: ballots[i]!,
            }));

            const { result, roundScores } = resolveRound(inputs, groupSize);
            for (let i = 0; i < runningTotals.length; i++) {
                runningTotals[i] = runningTotals[i]! + roundScores[i]!;
            }
            history.push(result);

            const matchOver = round >= totalRounds;
            const outcome: RoundOutcome = {
                round,
                garden: result,
                roundScores: roundScores.slice(),
                runningTotals: runningTotals.slice(),
                matchOver,
            };

            if (matchOver) {
                phase = 'ended';
            } else {
                round += 1;
                currentSignals = [];
                currentPlants = [];
                phase = 'talk';
            }
            return outcome;
        },

        async matchEnd(): Promise<MatchReport> {
            if (phase !== 'ended') throw new Error(`matchEnd() out of phase: ${phase}`);
            const finalScores: Array<[PlayerId, number]> = seats.map((s, i) => [s.id, runningTotals[i]!]);
            const groupTotal = runningTotals.reduce((a, b) => a + b, 0);
            await Promise.all(
                seats.map((seat, i) => {
                    const summary: MatchSummary = {
                        roundsPlayed: round,
                        finalScores: finalScores.slice(),
                        yourScore: runningTotals[i]!,
                    };
                    return callSeat(seat, 'matchEnd', () => seat.matchEnd(summary), undefined);
                }),
            );
            const scores: PlayerScore[] = seats.map((s, i) => ({ id: s.id, matchScore: runningTotals[i]! }));
            return {
                matchId: opts.matchId,
                groupSize,
                roundsPlayed: round,
                scores,
                groupTotal,
            };
        },
    };
}

export type MatchDriver = ReturnType<typeof createMatchDriver>;

/**
 * Convenience: drive a match to completion and return the report plus the full
 * round-by-round outcomes (handy for tests, logging, and the tournament loop).
 */
export async function runMatch(opts: MatchDriverOptions): Promise<{
    info: MatchInfo;
    outcomes: RoundOutcome[];
    report: MatchReport;
}> {
    const m = createMatchDriver(opts);
    const info = await m.matchStart();
    const outcomes: RoundOutcome[] = [];
    let over = false;
    while (!over) {
        await m.talk();
        await m.plant();
        const outcome = await m.vote();
        outcomes.push(outcome);
        over = outcome.matchOver;
    }
    const report = await m.matchEnd();
    return { info, outcomes, report };
}
