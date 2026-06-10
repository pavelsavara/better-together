import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScores } from './scoring.ts';
import type { MatchLog } from '../types.ts';

function log(matchId: string, scores: Array<[string, number]>): MatchLog {
    const groupTotal = scores.reduce((a, [, s]) => a + s, 0);
    return {
        matchId,
        seed: 's',
        engineVersion: '0.1.0',
        triggeredBy: scores[0]![0],
        groupSize: scores.length,
        players: scores.map(([id]) => id),
        playerDigests: {},
        roundsPlayed: 8,
        rounds: [],
        scores: scores.map(([id, matchScore]) => ({ id, matchScore })),
        groupTotal,
    };
}

test('co-player score is the bot mean group_total minus the field mean', () => {
    // Two matches: high-total table with A, low-total table without A.
    const matches: MatchLog[] = [
        log('2026-01-01T00:00:00Z-0001', [['a', 20], ['b', 20], ['c', 20], ['d', 20]]), // total 80
        log('2026-01-01T00:00:00Z-0002', [['b', 10], ['c', 10], ['e', 10], ['f', 10]]), // total 40
    ];
    const s = computeScores(matches, { windowPerBot: 500, minMatchesToRank: 1 }, 'now');
    assert.equal(s.baselineMeanGroupTotal, 60); // (80 + 40) / 2
    const a = s.leaderboard.find((r) => r.id === 'a')!;
    assert.equal(a.coPlayerScore, 20); // 80 - 60
    const b = s.leaderboard.find((r) => r.id === 'b')!;
    assert.equal(b.coPlayerScore, 0); // mean(80,40)=60 - 60
});

test('a bot stays unranked (rank null) until it crosses the match threshold', () => {
    const matches: MatchLog[] = [
        log('m1', [['a', 1], ['b', 1], ['c', 1], ['d', 1]]),
        log('m2', [['a', 1], ['b', 1], ['c', 1], ['d', 1]]),
    ];
    const s = computeScores(matches, { windowPerBot: 500, minMatchesToRank: 3 }, 'now');
    for (const row of s.leaderboard) {
        assert.equal(row.ranked, false);
        assert.equal(row.rank, null);
        assert.equal(row.matchesInWindow, 2);
    }
});

test('ranked bots are ordered by co-player score and numbered', () => {
    const matches: MatchLog[] = [
        log('m1', [['hi', 30], ['p', 0], ['q', 0], ['r', 0]]), // total 30 (with hi)
        log('m2', [['lo', 0], ['p', 0], ['q', 0], ['r', 0]]), // total 0 (with lo)
    ];
    // baseline = (30 + 0) / 2 = 15. hi: 30-15=+15; lo: 0-15=-15.
    const s = computeScores(matches, { windowPerBot: 500, minMatchesToRank: 1 }, 'now');
    assert.equal(s.leaderboard[0]!.id, 'hi');
    assert.equal(s.leaderboard[0]!.rank, 1);
    assert.ok(s.leaderboard[0]!.coPlayerScore > s.leaderboard[1]!.coPlayerScore);
    assert.equal(s.leaderboard[s.leaderboard.length - 1]!.id, 'lo');
});

test('the per-bot window keeps only the most recent matches', () => {
    const matches: MatchLog[] = [
        log('2026-01-01T00:00:03Z', [['a', 100], ['b', 0], ['c', 0], ['d', 0]]), // newest
        log('2026-01-01T00:00:02Z', [['a', 100], ['b', 0], ['c', 0], ['d', 0]]),
        log('2026-01-01T00:00:01Z', [['a', 0], ['b', 0], ['c', 0], ['d', 0]]), // oldest, dropped by window 2
    ];
    const s = computeScores(matches, { windowPerBot: 2, minMatchesToRank: 1 }, 'now');
    const a = s.leaderboard.find((r) => r.id === 'a')!;
    assert.equal(a.matchesInWindow, 2);
    assert.equal(a.rawScore, 100); // mean of the two newest (100, 100), oldest 0 dropped
});
