import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRound, type RoundInput } from './resolve.ts';

// docs/engine-rules.md Appendix B — the K=4 worked example. This is the golden
// fixture the whole engine is anchored to.
test('Appendix B worked example reproduces exactly', () => {
    const inputs: RoundInput[] = [
        { id: 'alice', plant: 8, signal: 'bloom', vote: 'bob' },
        { id: 'bob', plant: 0, signal: 'hold', vote: null },
        { id: 'carol', plant: 6, signal: 'bloom', vote: 'bob' },
        { id: 'dave', plant: 7, signal: 'watch', vote: 'bob' },
    ];
    const { result, roundScores } = resolveRound(inputs, 4);

    assert.equal(result.gardenTotal, 21);
    assert.equal(result.taxTarget, 'bob');
    assert.equal(result.taxCollected, 4);
    assert.equal(result.gardenPayout, 12.5);

    assert.deepEqual(roundScores, [14.5, 18.5, 16.5, 15.5]);

    // The welfare identity: group_total = 10K + garden_total + tax_collected.
    const groupTotal = roundScores.reduce((a, b) => a + b, 0);
    assert.equal(groupTotal, 65);
    assert.equal(groupTotal, 10 * 4 + result.gardenTotal + result.taxCollected);
});

test('full cooperation (no hoarder) yields no tax and higher group total', () => {
    const inputs: RoundInput[] = [
        { id: 'a', plant: 8, signal: 'bloom', vote: null },
        { id: 'b', plant: 8, signal: 'bloom', vote: null },
        { id: 'c', plant: 6, signal: 'bloom', vote: null },
        { id: 'd', plant: 7, signal: 'watch', vote: null },
    ];
    const { result, roundScores } = resolveRound(inputs, 4);
    assert.equal(result.gardenTotal, 29);
    assert.equal(result.taxTarget, null);
    assert.equal(result.taxCollected, 0);
    assert.equal(roundScores.reduce((a, b) => a + b, 0), 69);
});

test('a lone voter cannot tax anyone (>= 2 distinct voters required)', () => {
    const inputs: RoundInput[] = [
        { id: 'a', plant: 8, signal: 'bloom', vote: 'b' },
        { id: 'b', plant: 0, signal: 'hold', vote: null },
        { id: 'c', plant: 8, signal: 'bloom', vote: null },
        { id: 'd', plant: 8, signal: 'bloom', vote: null },
    ];
    const { result } = resolveRound(inputs, 4);
    assert.equal(result.taxTarget, null);
    assert.equal(result.taxCollected, 0);
});

test('a tie for the top vote-weight means no tax', () => {
    const inputs: RoundInput[] = [
        { id: 'a', plant: 0, signal: 'hold', vote: 'b' },
        { id: 'b', plant: 0, signal: 'hold', vote: 'a' },
        { id: 'c', plant: 8, signal: 'bloom', vote: 'a' },
        { id: 'd', plant: 8, signal: 'bloom', vote: 'b' },
    ];
    // a: voted by b(1) + d(2) = 3 ; b: voted by a(1) + c(2) = 3 ; tie → no tax.
    const { result } = resolveRound(inputs, 4);
    assert.equal(result.taxTarget, null);
});

test('a target who kept <= 2 (planted >= 8) is immune to the tax', () => {
    const inputs: RoundInput[] = [
        { id: 'a', plant: 8, signal: 'bloom', vote: 'd' },
        { id: 'b', plant: 8, signal: 'bloom', vote: 'd' },
        { id: 'c', plant: 8, signal: 'bloom', vote: 'd' },
        { id: 'd', plant: 8, signal: 'hold', vote: null }, // kept 2 → immune
    ];
    const { result } = resolveRound(inputs, 4);
    assert.equal(result.taxTarget, null);
    assert.equal(result.taxCollected, 0);
});

test('contributor ballots (plant >= 3) carry 2 votes; sub-floor carries 1', () => {
    // a (plant 0, weight 1) and b (plant 0, weight 1) vote c; c voted by 2 voters
    // weight 2. d (plant 5, weight 2) votes a. a has 1 voter only → ineligible.
    const inputs: RoundInput[] = [
        { id: 'a', plant: 0, signal: 'hold', vote: 'c' },
        { id: 'b', plant: 0, signal: 'hold', vote: 'c' },
        { id: 'c', plant: 5, signal: 'bloom', vote: 'a' },
        { id: 'd', plant: 5, signal: 'bloom', vote: 'a' },
    ];
    // c: voters {a,b}=2, weight 2 (eligible). a: voters {c,d}=2, weight 4 (eligible).
    // a has uniquely highest weight (4 > 2) → a is taxed. a kept 10.
    const { result } = resolveRound(inputs, 4);
    assert.equal(result.taxTarget, 'a');
    assert.equal(result.taxCollected, 4); // floor((10-2)/2)
});

test('tax reclaim has a floor of 1 for a barely-taxable target', () => {
    // target kept 3 (planted 7): floor((3-2)/2)=0 → min 1.
    const inputs: RoundInput[] = [
        { id: 'a', plant: 8, signal: 'bloom', vote: 'd' },
        { id: 'b', plant: 8, signal: 'bloom', vote: 'd' },
        { id: 'c', plant: 8, signal: 'bloom', vote: 'd' },
        { id: 'd', plant: 7, signal: 'hold', vote: null }, // kept 3
    ];
    const { result } = resolveRound(inputs, 4);
    assert.equal(result.taxTarget, 'd');
    assert.equal(result.taxCollected, 1);
});

test('votes for non-players are ignored', () => {
    const inputs: RoundInput[] = [
        { id: 'a', plant: 8, signal: 'bloom', vote: 'ghost' },
        { id: 'b', plant: 8, signal: 'bloom', vote: 'ghost' },
        { id: 'c', plant: 0, signal: 'hold', vote: null },
        { id: 'd', plant: 0, signal: 'hold', vote: null },
    ];
    const { result } = resolveRound(inputs, 4);
    assert.equal(result.taxTarget, null);
});
