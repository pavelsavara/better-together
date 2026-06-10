import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRosters, type PoolBot } from './generate.ts';

const pool = (ids: string[], counts: Record<string, number> = {}): PoolBot[] =>
    ids.map((id) => ({ id, matchesInWindow: counts[id] ?? 0 }));

test('every roster seats a changed bot, is K in [4,6], and has distinct ids', () => {
    const rosters = generateRosters({
        changed: ['a'],
        pool: pool(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
        budget: 50,
        seed: 'roster-seed',
    });
    assert.equal(rosters.length, 50);
    for (const r of rosters) {
        assert.ok(r.includes('a'));
        assert.ok(r.length >= 4 && r.length <= 6, `K out of range: ${r.length}`);
        assert.equal(new Set(r).size, r.length); // distinct
    }
});

test('generation is deterministic for a fixed seed', () => {
    const opts = { changed: ['a', 'b'], pool: pool(['a', 'b', 'c', 'd', 'e']), budget: 20, seed: 'fixed' };
    assert.deepEqual(generateRosters(opts), generateRosters(opts));
});

test('changed bots are seated round-robin', () => {
    const rosters = generateRosters({ changed: ['a', 'b'], pool: pool(['a', 'b', 'c', 'd', 'e']), budget: 6, seed: 's' });
    assert.ok(rosters[0]!.includes('a'));
    assert.ok(rosters[1]!.includes('b'));
    assert.ok(rosters[2]!.includes('a'));
});

test('opponent weighting favors under-sampled bots', () => {
    // 'b' has 0 matches, 'z' has 1000. Over many rosters seating 'a', 'b' should
    // be drawn far more often than 'z'.
    const rosters = generateRosters({
        changed: ['a'],
        pool: pool(['a', 'b', 'c', 'd', 'z'], { b: 0, c: 500, d: 500, z: 1000 }),
        budget: 300,
        seed: 'weight',
    });
    let bCount = 0;
    let zCount = 0;
    for (const r of rosters) {
        if (r.includes('b')) bCount++;
        if (r.includes('z')) zCount++;
    }
    assert.ok(bCount > zCount, `expected b (${bCount}) drawn more than z (${zCount})`);
});

test('throws when the active pool is too small to fill a table', () => {
    assert.throws(() => generateRosters({ changed: ['a'], pool: pool(['a', 'b', 'c']), budget: 1, seed: 's' }), />= 4 active bots/);
});

test('no changed bots yields no rosters', () => {
    assert.deepEqual(generateRosters({ changed: [], pool: pool(['a', 'b', 'c', 'd']), budget: 10, seed: 's' }), []);
});
