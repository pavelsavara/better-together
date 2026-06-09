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

/**
 * Compute a round-result the way the engine would, from a list of actions.
 * @param {{id:string,plant:number,signal:string}[]} actions
 * @param {number} groupSize K
 */
export function roundResult(actions, groupSize = actions.length) {
    const gardenTotal = actions.reduce((s, a) => s + a.plant, 0);
    const contributors = actions.filter((a) => a.plant >= 3).length;
    const multiplier = 1.0 + 0.5 * contributors;
    const gardenPayout = (gardenTotal * multiplier) / groupSize;
    return { actions, gardenTotal, multiplier, gardenPayout };
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

/** A round-state record for talk/plant. */
export function roundState({ round = 1, history = [], signals = [] } = {}) {
    return { round, history, signals };
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

/** Convenience opponent model: everyone always hoards. */
export function alwaysHoard(ids) {
    return (_round, _history) => ids.map((id) => action(id, 0, 'hold'));
}
