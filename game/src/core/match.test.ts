import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatchDriver, runMatch, validateSignal, validatePlant, validateVote } from './match.ts';
import type { Seat, Signal, Ballot, RoundState, MatchContext, MatchSummary } from '../types.ts';

/** A scripted mock seat. Returns fixed signal/plant, abstains, records calls. */
function mockSeat(id: string, signal: Signal, plant: number, vote: Ballot = null): Seat {
    return {
        id,
        metadata: () => ({ name: `together.${id}`, version: '1.0.0', author: 'test', repo: '', lore: '', glyph: '🌱', icon: null }),
        matchStart: (_ctx: MatchContext) => { },
        talk: (_s: RoundState) => signal,
        plant: (_s: RoundState) => plant,
        vote: (_s: RoundState) => vote,
        matchEnd: (_s: MatchSummary) => { },
    };
}

test('validators coerce bad input to defaults', () => {
    assert.equal(validateSignal('bloom'), 'bloom');
    assert.equal(validateSignal('nonsense'), 'watch');
    assert.equal(validateSignal(42), 'watch');
    assert.equal(validatePlant(5), 5);
    assert.equal(validatePlant(99), 10);
    assert.equal(validatePlant(-3), 0);
    assert.equal(validatePlant(3.9), 3);
    assert.equal(validatePlant('x'), 0);
    const ids = new Set(['a', 'b']);
    assert.equal(validateVote('a', ids), 'a');
    assert.equal(validateVote('z', ids), null);
    assert.equal(validateVote(7, ids), null);
});

test('a full match runs to completion with a valid report', async () => {
    const seats: Seat[] = [
        mockSeat('a', 'bloom', 8),
        mockSeat('b', 'hold', 0),
        mockSeat('c', 'bloom', 6),
        mockSeat('d', 'watch', 7),
    ];
    const { info, outcomes, report } = await runMatch({ matchId: 'm1', seed: 'seed-a', seats });

    assert.equal(info.groupSize, 4);
    assert.equal(report.groupSize, 4);
    assert.ok(report.roundsPlayed >= 8);
    assert.equal(outcomes.length, report.roundsPlayed);
    assert.equal(outcomes[outcomes.length - 1]!.matchOver, true);
    assert.equal(report.scores.length, 4);
    // group total equals the sum of per-player match scores.
    const sum = report.scores.reduce((a, s) => a + s.matchScore, 0);
    assert.ok(Math.abs(sum - report.groupTotal) < 1e-9);
});

test('welfare identity holds every round: group_total = 10K + garden + tax', async () => {
    const seats: Seat[] = [
        mockSeat('a', 'bloom', 8, 'b'),
        mockSeat('b', 'hold', 0),
        mockSeat('c', 'bloom', 6, 'b'),
        mockSeat('d', 'watch', 7, 'b'),
    ];
    const { outcomes } = await runMatch({ matchId: 'm2', seed: 'identity', seats });
    for (const o of outcomes) {
        const groupRound = o.roundScores.reduce((a, b) => a + b, 0);
        const expected = 10 * 4 + o.garden.gardenTotal + o.garden.taxCollected;
        assert.ok(Math.abs(groupRound - expected) < 1e-9, `round ${o.round}: ${groupRound} != ${expected}`);
    }
});

test('the same seed replays identically', async () => {
    const make = (): Seat[] => [
        mockSeat('a', 'bloom', 8, 'b'),
        mockSeat('b', 'hold', 0),
        mockSeat('c', 'bloom', 6, 'b'),
        mockSeat('d', 'watch', 7, 'b'),
    ];
    const r1 = await runMatch({ matchId: 'm', seed: 'replay-me', seats: make() });
    const r2 = await runMatch({ matchId: 'm', seed: 'replay-me', seats: make() });
    assert.equal(r1.report.roundsPlayed, r2.report.roundsPlayed);
    assert.deepEqual(r1.report.scores, r2.report.scores);
    assert.deepEqual(
        r1.outcomes.map((o) => o.runningTotals),
        r2.outcomes.map((o) => o.runningTotals),
    );
});

test('a trapping seat degrades to defaults without aborting the match', async () => {
    const bad: Seat = {
        id: 'bad',
        metadata: () => ({ name: 'together.bad', version: '1.0.0', author: '', repo: '', lore: '', glyph: '💥', icon: null }),
        matchStart: () => { },
        talk: () => {
            throw new Error('boom');
        },
        plant: () => {
            throw new Error('boom');
        },
        vote: () => {
            throw new Error('boom');
        },
        matchEnd: () => { },
    };
    const seats: Seat[] = [bad, mockSeat('a', 'bloom', 8), mockSeat('b', 'bloom', 8), mockSeat('c', 'bloom', 8)];
    const { outcomes, report } = await runMatch({ matchId: 'm3', seed: 'trap', seats });
    // The bad seat defaulted to WATCH / plant 0 / abstain — match still completed.
    assert.ok(report.roundsPlayed >= 8);
    for (const o of outcomes) {
        const badAction = o.garden.actions.find((p) => p.id === 'bad')!;
        assert.equal(badAction.plant, 0);
        assert.equal(badAction.signal, 'watch');
    }
});

test('phase guards reject out-of-order driver calls', async () => {
    const m = createMatchDriver({
        matchId: 'm',
        seed: 's',
        seats: [mockSeat('a', 'bloom', 8), mockSeat('b', 'bloom', 8), mockSeat('c', 'bloom', 8), mockSeat('d', 'bloom', 8)],
    });
    await assert.rejects(() => m.talk(), /out of phase/);
    await m.matchStart();
    await assert.rejects(() => m.plant(), /out of phase/);
    await assert.rejects(() => m.vote(), /out of phase/);
    await assert.rejects(() => m.matchEnd(), /out of phase/);
});

test('seat-call hooks can force a default by throwing (timing/sandbox enforcement)', async () => {
    let blocked = 0;
    const seats: Seat[] = [
        mockSeat('a', 'bloom', 9),
        mockSeat('b', 'bloom', 9),
        mockSeat('c', 'bloom', 9),
        mockSeat('d', 'bloom', 9),
    ];
    const { outcomes } = await runMatch({
        matchId: 'm',
        seed: 'hooked',
        seats,
        hooks: {
            async onCall(seat, phase, invoke) {
                if (seat.id === 'a' && phase === 'plant') {
                    blocked++;
                    throw new Error('simulated 50ms timeout');
                }
                return await invoke();
            },
        },
    });
    assert.ok(blocked > 0);
    for (const o of outcomes) {
        const a = o.garden.actions.find((p) => p.id === 'a')!;
        assert.equal(a.plant, 0); // forced default
    }
});
