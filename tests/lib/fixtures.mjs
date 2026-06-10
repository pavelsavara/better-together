// Game-data fixtures and helpers for driving gardener players.
// Field names match the jsco runtime (camelCase records, lowercase signal strings).
// Scoring mirrors docs/engine-rules.md §3-4.

export const SIGNALS = ['bloom', 'hold', 'watch'];

/** A player-action record: { id, plant, signal }. */
export function action(id, plant, signal = 'watch') {
    return { id, plant, signal };
}

/** A signal-broadcast record: { id, signal }. */
export function broadcast(id, signal) {
    return { id, signal };
}

/** Minimum untaxable holding: the vote can never reclaim a player's first T kept seeds. */
export const UNTAXABLE_MIN = 2;

/**
 * Resolve the vote the way the engine would: weighted plurality (contributors who
 * planted >= 3 cast 2 votes, else 1) needing >= 2 distinct voters and the uniquely
 * highest weight; a target who kept <= UNTAXABLE_MIN is immune.
 * @param {{id:string,plant:number}[]} actions
 * @param {{voter:string,target:(string|null)}[]} votes
 * @returns {{taxTarget:(string|null), taxCollected:number}}
 */
export function resolveTax(actions, votes) {
    const plantOf = new Map(actions.map((a) => [a.id, a.plant]));
    const tally = new Map(); // target -> { weight, voters:Set }
    for (const v of votes) {
        if (!v || v.target == null) continue;
        const weight = (plantOf.get(v.voter) ?? 0) >= 3 ? 2 : 1;
        const t = tally.get(v.target) ?? { weight: 0, voters: new Set() };
        t.weight += weight;
        t.voters.add(v.voter);
        tally.set(v.target, t);
    }
    let best = null;
    let tie = false;
    for (const [target, { weight, voters }] of tally) {
        if (voters.size < 2) continue; // a lone voter can't tax
        if (!best || weight > best.weight) { best = { target, weight }; tie = false; }
        else if (weight === best.weight) tie = true;
    }
    if (!best || tie) return { taxTarget: null, taxCollected: 0 };
    const kept = 10 - (plantOf.get(best.target) ?? 0);
    if (kept <= UNTAXABLE_MIN) return { taxTarget: null, taxCollected: 0 };
    const taxCollected = Math.max(1, Math.floor((kept - UNTAXABLE_MIN) / 2));
    return { taxTarget: best.target, taxCollected };
}

/**
 * Compute a round-result the way the engine would, from this round's actions and
 * (optionally) the ballots cast in the vote phase. The garden is flatly DOUBLED;
 * any tax-collected seeds are folded into the garden before doubling.
 * @param {{id:string,plant:number,signal:string}[]} actions
 * @param {number} groupSize K
 * @param {{voter:string,target:(string|null)}[]} votes
 */
export function roundResult(actions, groupSize = actions.length, votes = []) {
    const gardenTotal = actions.reduce((s, a) => s + a.plant, 0);
    const { taxTarget, taxCollected } = resolveTax(actions, votes);
    const gardenPayout = ((gardenTotal + taxCollected) * 2) / groupSize;
    return { actions, gardenTotal, votes, taxTarget, taxCollected, gardenPayout };
}

/** A match-context record. selfId defaults to the first player id. */
export function matchContext({ matchId = 'm1', players, selfId, groupSize } = {}) {
    const ids = players ?? ['self', 'rival', 'ally'];
    return {
        matchId,
        players: ids,
        selfId: selfId ?? ids[0],
        groupSize: groupSize ?? ids.length,
    };
}

/** A round-state record for talk/plant/vote. */
export function roundState({ round = 1, history = [], signals = [], plants = [] } = {}) {
    return { round, history, signals, plants };
}

/** A match-summary record for match-end. */
export function matchSummary({ roundsPlayed = 1, finalScores = [], yourScore = 0 } = {}) {
    return { roundsPlayed, finalScores, yourScore };
}

/**
 * Drive a full match against a player wrapper. The opponents are modeled by the
 * caller via `opponentActions(round, history)` which returns the OTHER players'
 * actions for the round (not including self). This lets each test script the
 * social environment and observe how the bot reacts.
 *
 * @param {import('./harness.mjs').GardenerPlayer} player
 * @param {number} handle
 * @param {object} opts
 * @param {string} [opts.selfId]
 * @param {string[]} [opts.players] full player id list (incl. self)
 * @param {number} [opts.rounds]
 * @param {(round:number, history:object[]) => {id:string,plant:number,signal:string}[]} opts.opponentActions
 * @returns {Promise<{rounds: object[], selfSignals: string[], selfPlants: number[]}>}
 *   rounds[i] is the round-result (incl. self's action) for round i+1.
 */
export async function runMatch(player, handle, opts) {
    const players = opts.players ?? ['self', 'rival', 'ally'];
    const selfId = opts.selfId ?? players[0];
    const groupSize = players.length;
    const rounds = opts.rounds ?? 8;

    await player.matchStart(handle, matchContext({ players, selfId, groupSize }));

    const history = [];
    const selfSignals = [];
    const selfPlants = [];

    for (let r = 1; r <= rounds; r++) {
        // Talk phase: collect this round's signals (self + opponents).
        const oppActions = opts.opponentActions(r, history);
        const signals = [];
        const selfSignal = await player.talk(handle, roundState({ round: r, history, signals: [] }));
        selfSignals.push(selfSignal);
        signals.push(broadcast(selfId, selfSignal));
        for (const a of oppActions) signals.push(broadcast(a.id, a.signal));

        // Plant phase: self sees all signals for this round.
        const selfPlant = await player.plant(handle, roundState({ round: r, history, signals }));
        selfPlants.push(selfPlant);

        // Resolve the round.
        const actions = [action(selfId, selfPlant, selfSignal), ...oppActions];
        history.push(roundResult(actions, groupSize));
    }

    return { rounds: history, selfSignals, selfPlants };
}

/** Convenience opponent model: everyone always cooperates generously. */
export function alwaysBloom(ids) {
    return (_round, _history) => ids.map((id) => action(id, 8, 'bloom'));
}

/** Convenience opponent model: everyone always keeps. */
export function alwaysKeep(ids) {
    return (_round, _history) => ids.map((id) => action(id, 0, 'hold'));
}
