// Generic player-API conformance tests, run against EVERY sample that is built.
// Missing samples are skipped (their .wasm isn't present).
//
// Each test uses a FRESH instance and makes a single meaningful export call after
// create(), keeping cases isolated. The one inherently multi-call case
// ("a full round") exercises talk -> plant in sequence.
//
// Run: node --experimental-wasm-jspi players.test.mjs
//   or: node --experimental-wasm-jspi run.mjs

import assert from 'node:assert/strict';
import { loadGardener, resolveSample } from './lib/harness.mjs';
import { matchContext, roundState, matchSummary, action, broadcast, roundResult, SIGNALS } from './lib/fixtures.mjs';
import { test, runAll, skipTest } from './lib/runner.mjs';

const SAMPLES = ['ferris', 'corro', 'khaos', 'gopher', 'micro', 'keith', 'andy', 'dusty', 'bram', 'reynard'];

// Banter on stdout is optional flavor, not part of the player contract. Bots that
// are silent by design (e.g. dusty's minimal hand-written canonical ABI) opt out.
const NO_BANTER = new Set(['dusty', 'micro']);

/** Load a sample or skip the test if it isn't built. */
async function loadOrSkip(name, opts) {
    const { exists } = resolveSample(name);
    if (!exists) skipTest(`${name}.wasm not built`);
    return loadGardener(name, opts);
}

/** Register all conformance tests. Called by run.mjs (or directly below). */
export function register() {
    for (const name of SAMPLES) {
        test(`${name}: create() yields a usable handle`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                assert.equal(typeof h, 'number', 'handle should be an integer rep');
                assert.ok(Number.isInteger(h) && h >= 0, 'handle is a non-negative integer');
            } finally {
                p.dispose();
            }
        });

        test(`${name}: metadata() returns a well-formed record`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                const m = await p.metadata(h);
                assert.ok(m && typeof m === 'object', 'metadata is a record');
                for (const field of ['name', 'version', 'author', 'repo', 'lore']) {
                    assert.equal(typeof m[field], 'string', `metadata.${field} is a string`);
                    assert.ok(m[field].length > 0, `metadata.${field} is non-empty`);
                }
            } finally {
                p.dispose();
            }
        });

        test(`${name}: match-start accepts a context`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                // result<_> success -> undefined; just assert it does not throw.
                await p.matchStart(h, matchContext({ players: ['self', 'a', 'b', 'c'], selfId: 'self' }));
            } finally {
                p.dispose();
            }
        });

        test(`${name}: talk() returns a valid signal`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                const sig = await p.talk(h, roundState({ round: 1 }));
                assert.ok(SIGNALS.includes(sig), `talk returned a valid signal, got ${JSON.stringify(sig)}`);
            } finally {
                p.dispose();
            }
        });

        test(`${name}: plant() returns an integer in [0,10]`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                // Everyone signalling bloom so signal-matchers (micro) react.
                const signals = [broadcast('self', 'bloom'), broadcast('a', 'bloom'), broadcast('b', 'bloom')];
                const plant = await p.plant(h, roundState({ round: 1, signals }));
                assert.equal(typeof plant, 'number');
                assert.ok(Number.isInteger(plant), 'plant is an integer');
                assert.ok(plant >= 0 && plant <= 10, `plant in [0,10], got ${plant}`);
            } finally {
                p.dispose();
            }
        });

        test(`${name}: match-end accepts a summary`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                await p.matchEnd(h, matchSummary({
                    roundsPlayed: 3,
                    finalScores: [['self', 21.5], ['a', 18.0], ['b', 24.25]],
                    yourScore: 21.5,
                }));
            } finally {
                p.dispose();
            }
        });

        test(`${name}: emits stdout banter`, async () => {
            if (NO_BANTER.has(name)) skipTest(`${name} is silent by design`);
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                await p.talk(h, roundState({ round: 1 }));
                const out = p.stdout();
                // Bots with banter print something during talk.
                assert.ok(out.length > 0, `${name} wrote to stdout`);
            } finally {
                p.dispose();
            }
        });

        // Inherently multi-call: talk -> plant -> next-round talk with history.
        test(`${name}: a full round (talk -> plant -> history) works`, async () => {
            const p = await loadOrSkip(name);
            try {
                const h = await p.create();
                const ctx = matchContext({ players: ['self', 'a', 'b'], selfId: 'self' });
                await p.matchStart(h, ctx);

                const sig = await p.talk(h, roundState({ round: 1 }));
                const signals = [broadcast('self', sig), broadcast('a', 'bloom'), broadcast('b', 'hold')];
                const plant = await p.plant(h, roundState({ round: 1, signals }));

                // Round 2 with last round's resolved history present.
                const r1 = roundResult([action('self', plant, sig), action('a', 8, 'bloom'), action('b', 0, 'hold')], 3);
                const sig2 = await p.talk(h, roundState({ round: 2, history: [r1] }));
                assert.ok(SIGNALS.includes(sig2));
                const plant2 = await p.plant(h, roundState({ round: 2, history: [r1], signals: [broadcast('self', sig2)] }));
                assert.ok(plant2 >= 0 && plant2 <= 10);
            } finally {
                p.dispose();
            }
        });
    }
}

// Allow running this file directly.
if (process.argv[1] && process.argv[1].endsWith('players.test.mjs')) {
    register();
    const { failed } = await runAll('player API conformance');
    if (failed > 0) process.exitCode = 1;
}
