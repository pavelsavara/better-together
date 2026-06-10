import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng, rollRoundCount, matchSeed } from './rng.ts';

test('same seed produces an identical float sequence', () => {
    const a = new Rng('deadbeef');
    const b = new Rng('deadbeef');
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
    const a = new Rng('seed-one');
    const b = new Rng('seed-two');
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    assert.notDeepEqual(seqA, seqB);
});

test('float is always in [0, 1)', () => {
    const r = new Rng('range-check');
    for (let i = 0; i < 1000; i++) {
        const f = r.float();
        assert.ok(f >= 0 && f < 1, `float out of range: ${f}`);
    }
});

test('int respects inclusive bounds', () => {
    const r = new Rng('int-check');
    for (let i = 0; i < 1000; i++) {
        const n = r.int(4, 6);
        assert.ok(n >= 4 && n <= 6 && Number.isInteger(n), `int out of range: ${n}`);
    }
});

test('shuffle is deterministic and a permutation', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new Rng('shuffle').shuffle(arr);
    const b = new Rng('shuffle').shuffle(arr);
    assert.deepEqual(a, b);
    assert.deepEqual([...a].sort((x, y) => x - y), arr);
    assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
});

test('rollRoundCount is at least the minimum and deterministic', () => {
    for (let i = 0; i < 50; i++) {
        const r = new Rng(`round-${i}`);
        const n = rollRoundCount(r);
        assert.ok(n >= 8, `round count below minimum: ${n}`);
        assert.ok(n <= 200, `round count above hard cap: ${n}`);
    }
    assert.equal(rollRoundCount(new Rng('fixed')), rollRoundCount(new Rng('fixed')));
});

test('rollRoundCount mean is approximately 10', () => {
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += rollRoundCount(new Rng(`mean-${i}`));
    const mean = sum / n;
    assert.ok(mean > 9.4 && mean < 10.6, `mean round count off: ${mean}`);
});

test('matchSeed is stable and index-sensitive', () => {
    assert.equal(matchSeed('master', 0), matchSeed('master', 0));
    assert.notEqual(matchSeed('master', 0), matchSeed('master', 1));
});
