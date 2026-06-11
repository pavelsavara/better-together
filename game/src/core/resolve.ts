// Round resolution — the pure core of the game (docs/engine-rules.md §3-§5).
//
// Given the K players' plants, signals and votes for one round, compute the tax,
// the garden payout, and each player's round score. No randomness, no I/O — fully
// deterministic and unit-testable against the Appendix B worked example.

import type { PlayerId, Signal, RoundResult, PlayerAction, VoteRecord } from '../types.ts';

/** Untaxable minimum: the first T kept seeds can never be reclaimed (§4). */
export const UNTAXABLE_MINIMUM = 2;
/** Contributor floor: planting >= this grants a 2-vote ballot (§2). */
export const CONTRIBUTOR_FLOOR = 3;
/** Seeds each player is endowed with per round. */
export const ENDOWMENT = 10;

/** One player's committed inputs for a single round. */
export interface RoundInput {
    id: PlayerId;
    /** Seeds planted, already clamped to 0-10 by the caller. */
    plant: number;
    signal: Signal;
    /** Ballot: whom to tax, or null to abstain. */
    vote: PlayerId | null;
}

/** The resolved round plus the per-player round scores, in input order. */
export interface ResolvedRound {
    result: RoundResult;
    /** Each player's score for this round, in the same order as `inputs`. */
    roundScores: number[];
}

/** Seeds a player kept this round (before any tax). */
function keptOf(plant: number): number {
    return ENDOWMENT - plant;
}

/**
 * Determine the tax-target for the round, or null if no tax applies.
 *
 * A target is eligible only if named by >= 2 distinct voters. Among eligible
 * targets, the one with the UNIQUELY highest vote-weight wins (a tie for the top
 * weight → no tax). Contributors (plant >= 3) cast 2 votes, everyone else 1.
 */
function electTaxTarget(inputs: RoundInput[]): PlayerId | null {
    const plantById = new Map<PlayerId, number>();
    for (const p of inputs) plantById.set(p.id, p.plant);

    const distinctVoters = new Map<PlayerId, Set<PlayerId>>();
    const weight = new Map<PlayerId, number>();

    for (const p of inputs) {
        if (p.vote == null) continue;
        if (!plantById.has(p.vote)) continue; // ignore votes for non-players
        const w = p.plant >= CONTRIBUTOR_FLOOR ? 2 : 1;
        weight.set(p.vote, (weight.get(p.vote) ?? 0) + w);
        let voters = distinctVoters.get(p.vote);
        if (!voters) {
            voters = new Set();
            distinctVoters.set(p.vote, voters);
        }
        voters.add(p.id);
    }

    let best: PlayerId | null = null;
    let bestWeight = 0;
    let tied = false;
    for (const [target, w] of weight) {
        const voters = distinctVoters.get(target);
        if (!voters || voters.size < 2) continue; // need >= 2 distinct voters
        if (w > bestWeight) {
            bestWeight = w;
            best = target;
            tied = false;
        } else if (w === bestWeight) {
            tied = true;
        }
    }
    return tied ? null : best;
}

/**
 * Resolve a single round: elect the tax-target, reclaim the tax, double the
 * garden, and split the payout. Returns the broadcast RoundResult plus each
 * player's round score, in `inputs` order.
 */
export function resolveRound(inputs: RoundInput[], groupSize: number): ResolvedRound {
    const k = groupSize;
    const gardenTotal = inputs.reduce((sum, p) => sum + p.plant, 0);

    const electedTarget = electTaxTarget(inputs);

    // Apply the untaxable minimum: a target who kept <= T is immune (no tax).
    let taxTarget: PlayerId | null = null;
    let taxCollected = 0;
    if (electedTarget != null) {
        const target = inputs.find((p) => p.id === electedTarget)!;
        const kept = keptOf(target.plant);
        if (kept > UNTAXABLE_MINIMUM) {
            taxTarget = electedTarget;
            taxCollected = Math.max(1, Math.floor((kept - UNTAXABLE_MINIMUM) / 2));
        }
    }

    const garden = gardenTotal + taxCollected;
    const gardenPayout = (garden * 2) / k;

    const roundScores = inputs.map((p) => {
        let score = keptOf(p.plant) + gardenPayout;
        if (p.id === taxTarget) score -= taxCollected;
        return score;
    });

    const actions: PlayerAction[] = inputs.map((p) => ({ id: p.id, plant: p.plant, signal: p.signal }));
    const votes: VoteRecord[] = inputs.map((p) => ({ voter: p.id, target: p.vote }));

    const result: RoundResult = {
        actions,
        gardenTotal,
        votes,
        taxTarget,
        taxCollected,
        gardenPayout,
    };

    return { result, roundScores };
}
