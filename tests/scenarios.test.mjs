// Personality scenario tests — exercise each bot's documented strategy across a
// scripted social environment, asserting the decisions it actually makes.
//
// Behaviours under test (from each sample's source / docs):
//   micro  : talk == 'watch' always; plant == (#bloom broadcasts) + 4, clamp 10.
//   corro  : talk == 'bloom' always; plant 4 when garden is barren (round 1 or no
//            opponent staked >=3 last round), else plant 0 (feast).
//   ferris : round 1 (no signals) -> plant 8, bloom; majority-bloom signals ->
//            leans to plant 10; persists ferris-memory.json at match-end with the
//            opponents it observed. A remembered defector -> plant 3, hold.
//   khaos  : random per-opponent friend/foe with cross-match memory; multi-call so
//            its full-match scenarios are xfail under the jsco post-return bug.
//
// Run: node --experimental-wasm-jspi scenarios.test.mjs
//   or: node --experimental-wasm-jspi run.mjs

import assert from 'node:assert/strict';
import { loadGardener, resolveSample } from './lib/harness.mjs';
import {
    matchContext, roundState, matchSummary, action, broadcast, roundResult,
    runMatch, alwaysBloom, alwaysHoard, SIGNALS,
} from './lib/fixtures.mjs';
import { test, runAll, skipTest } from './lib/runner.mjs';

async function loadOrSkip(name, opts) {
    const { exists } = resolveSample(name);
    if (!exists) skipTest(`${name}.wasm not built`);
    return loadGardener(name, opts);
}

export function register() {
    // ──────────────────────────── micro ────────────────────────────
    // Single-call invariants (safe for every runtime).
    test('micro: always signals watch', async () => {
        const p = await loadOrSkip('micro');
        try {
            const h = await p.create();
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'watch');
        } finally {
            p.dispose();
        }
    });

    test('micro: plant == bloom-count + 4 (two blooms -> 6)', async () => {
        const p = await loadOrSkip('micro');
        try {
            const h = await p.create();
            const signals = [broadcast('a', 'bloom'), broadcast('b', 'bloom'), broadcast('c', 'hold')];
            const plant = await p.plant(h, roundState({ round: 1, signals }));
            assert.equal(plant, 6);
        } finally {
            p.dispose();
        }
    });

    test('micro: plant clamps to 10 on a fully blooming table', async () => {
        const p = await loadOrSkip('micro');
        try {
            const h = await p.create();
            const signals = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => broadcast(id, 'bloom'));
            const plant = await p.plant(h, roundState({ round: 1, signals }));
            assert.equal(plant, 10);
        } finally {
            p.dispose();
        }
    });

    test('micro: plant == 4 with no bloom promises', async () => {
        const p = await loadOrSkip('micro');
        try {
            const h = await p.create();
            const signals = [broadcast('a', 'hold'), broadcast('b', 'watch')];
            const plant = await p.plant(h, roundState({ round: 1, signals }));
            assert.equal(plant, 4);
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── corro ────────────────────────────
    test('corro: talk is always bloom (the lie)', async () => {
        const p = await loadOrSkip('corro');
        try {
            const h = await p.create();
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'bloom');
        } finally {
            p.dispose();
        }
    });

    test('corro: round 1 plants bait (4) on a barren garden', async () => {
        const p = await loadOrSkip('corro');
        try {
            const h = await p.create();
            const plant = await p.plant(h, roundState({ round: 1 }));
            assert.equal(plant, 4);
        } finally {
            p.dispose();
        }
    });

    test('corro: feasts (plants 0) after an opponent staked >=3', async () => {
        const p = await loadOrSkip('corro');
        try {
            const h = await p.create();
            // History where an honest opponent planted a real stake last round.
            const last = roundResult([action('self', 0, 'bloom'), action('a', 8, 'bloom')], 4);
            const plant = await p.plant(h, roundState({ round: 2, history: [last] }));
            assert.equal(plant, 0);
        } finally {
            p.dispose();
        }
    });

    test('corro: re-baits (plants 4) after a barren round', async () => {
        const p = await loadOrSkip('corro');
        try {
            const h = await p.create();
            // Nobody staked >=3 last round -> garden barren -> bait again.
            const last = roundResult([action('self', 0, 'bloom'), action('a', 1, 'hold')], 4);
            const plant = await p.plant(h, roundState({ round: 2, history: [last] }));
            assert.equal(plant, 4);
        } finally {
            p.dispose();
        }
    });

    // Full deceptive arc (multi-call). corro is a Rust/std component -> safe.
    test('corro: promises bloom every round but mostly plants 0 vs cooperators', async () => {
        const p = await loadOrSkip('corro');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b', 'c'];
            const res = await runMatch(p, h, {
                players: ['self', ...oppIds],
                rounds: 6,
                opponentActions: alwaysBloom(oppIds), // honest cooperators planting 8
            });
            // Every promise is bloom.
            assert.ok(res.selfSignals.every((s) => s === 'bloom'), 'corro always promises bloom');
            // Round 1 baits (4); thereafter it feasts (0) because the garden stays alive.
            assert.equal(res.selfPlants[0], 4);
            assert.ok(res.selfPlants.slice(1).every((x) => x === 0), 'corro feasts after the garden is alive');
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── ferris ───────────────────────────
    test('ferris: round 1 with no signals plants the base 8 and blooms', async () => {
        const p = await loadOrSkip('ferris');
        try {
            const h = await p.create();
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'bloom');
            const plant = await p.plant(h, roundState({ round: 1 }));
            assert.equal(plant, 8);
        } finally {
            p.dispose();
        }
    });

    test('ferris: leans in to 10 when the table majority promises bloom', async () => {
        const p = await loadOrSkip('ferris');
        try {
            const h = await p.create();
            // A clear bloom majority among this round's signals.
            const signals = [broadcast('self', 'bloom'), broadcast('a', 'bloom'), broadcast('b', 'bloom')];
            const plant = await p.plant(h, roundState({ round: 1, signals }));
            assert.equal(plant, 10);
        } finally {
            p.dispose();
        }
    });

    test('ferris: cooperates generously across a friendly match', async () => {
        const p = await loadOrSkip('ferris');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            const res = await runMatch(p, h, {
                players: ['self', ...oppIds],
                rounds: 6,
                opponentActions: alwaysBloom(oppIds),
            });
            assert.ok(res.selfSignals.every((s) => s === 'bloom'), 'ferris broadcasts bloom among friends');
            // runMatch feeds self's own bloom + the opponents' blooms into the plant
            // phase every round, so the table always reads majority-bloom and ferris
            // leans all the way in. No opponent ever defects, so it never holds back.
            assert.ok(res.selfPlants.every((x) => x === 10), 'ferris leans into a blooming table every round');
        } finally {
            p.dispose();
        }
    });

    test('ferris: reads seeded cross-match memory (friend / defector / stranger)', async () => {
        // A persisted reputation file naming a long-term defector and a trusted friend.
        const seed = JSON.stringify({
            version: 1,
            players: {
                foe: { collaborative_rounds: 0, observed_rounds: 20, rate: 0.0 },
                pal: { collaborative_rounds: 20, observed_rounds: 20, rate: 1.0 },
            },
            friends: ['pal'],
        });

        // A known defector at the table -> ferris protects itself: hold, plant 3.
        let p = await loadOrSkip('ferris', { fs: new Map([['ferris-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'foe', 'x'], selfId: 'self' }));
            assert.equal(await p.talk(h, roundState({ round: 1 })), 'hold');
            assert.equal(await p.plant(h, roundState({ round: 1 })), 3);
        } finally {
            p.dispose();
        }

        // A trusted friend (and no defector) -> ferris leans in: bloom, plant 10.
        p = await loadOrSkip('ferris', { fs: new Map([['ferris-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'pal', 'x'], selfId: 'self' }));
            assert.equal(await p.talk(h, roundState({ round: 1 })), 'bloom');
            assert.equal(await p.plant(h, roundState({ round: 1 })), 10);
        } finally {
            p.dispose();
        }

        // Only strangers -> naive default: bloom, plant 8.
        p = await loadOrSkip('ferris', { fs: new Map([['ferris-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'x', 'y'], selfId: 'self' }));
            assert.equal(await p.talk(h, roundState({ round: 1 })), 'bloom');
            assert.equal(await p.plant(h, roundState({ round: 1 })), 8);
        } finally {
            p.dispose();
        }
    });

    test('ferris: persists reputation memory at match-end', async () => {
        const p = await loadOrSkip('ferris');
        try {
            const h = await p.create();
            const oppIds = ['gen', 'mid'];
            await runMatch(p, h, {
                players: ['self', ...oppIds],
                rounds: 6,
                // gen cooperates at 8 (collaborative); mid plants 1.
                opponentActions: (_r, _hist) => [action('gen', 8, 'bloom'), action('mid', 1, 'hold')],
            });
            await p.matchEnd(h, matchSummary({ roundsPlayed: 6, finalScores: [['self', 30]], yourScore: 30 }));

            // jsco's in-memory VFS does not mirror guest writes back into the seed Map,
            // so we assert the write path executed via ferris's own stderr log line.
            const err = p.stderr();
            assert.match(err, /saved reputation .* to ferris-memory\.json/, 'ferris saved its reputation file');
            assert.match(err, /1 friend\(s\)/, 'ferris recorded the generous opponent as a friend');
        } finally {
            p.dispose();
        }
    });

    test('ferris: honours an env-overridden memory path', async () => {
        // jsco's VFS exposes a single writable preopen and does not auto-create
        // nested directories on write, so the override points at a top-level file.
        const memPath = 'ferris-custom.json';
        const p = await loadOrSkip('ferris', { env: [['FERRIS_MEMORY_PATH', memPath]] });
        try {
            const h = await p.create();
            await runMatch(p, h, {
                players: ['self', 'a'],
                rounds: 4,
                opponentActions: alwaysBloom(['a']),
            });
            await p.matchEnd(h, matchSummary({ roundsPlayed: 4, finalScores: [['self', 20]], yourScore: 20 }));
            const err = p.stderr();
            assert.match(err, /no memory at ferris-custom\.json/, 'ferris read from the overridden path');
            assert.match(err, /saved reputation .* to ferris-custom\.json/, 'ferris saved to the overridden path');
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── khaos ────────────────────────────
    // Single-call invariants hold under any runtime.
    test('khaos: talk returns a valid signal', async () => {
        const p = await loadOrSkip('khaos');
        try {
            const h = await p.create();
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.ok(SIGNALS.includes(sig));
        } finally {
            p.dispose();
        }
    });

    test('khaos: plant returns an integer in [0,10]', async () => {
        const p = await loadOrSkip('khaos');
        try {
            const h = await p.create();
            const plant = await p.plant(h, roundState({ round: 1, signals: [broadcast('a', 'bloom')] }));
            assert.ok(Number.isInteger(plant) && plant >= 0 && plant <= 10);
        } finally {
            p.dispose();
        }
    });

    // Multi-call: khaos's persistence + per-opponent mood across a match. Under the
    // current jsco build the 2nd export call after create() traps, so this is xfail.
    test.xfail('khaos: plays a full match and persists its mood memory', async () => {
        const p = await loadOrSkip('khaos');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            const res = await runMatch(p, h, {
                players: ['self', ...oppIds],
                rounds: 6,
                opponentActions: alwaysBloom(oppIds),
            });
            assert.ok(res.selfSignals.every((s) => SIGNALS.includes(s)));
            assert.ok(res.selfPlants.every((x) => Number.isInteger(x) && x >= 0 && x <= 10));
            await p.matchEnd(h, matchSummary({ roundsPlayed: 6, finalScores: [['self', 25]], yourScore: 25 }));
            const key = findVfsKey(p.fs, 'khaos-memory.json');
            assert.ok(key, 'khaos persisted its mood memory');
        } finally {
            p.dispose();
        }
    }, 'jsco post-return bug: instance poisoned on 2nd export call after create()');

    // ──────────────────────────── keith ────────────────────────────
    test('keith: round 1 opens generously and blooms honestly', async () => {
        const p = await loadOrSkip('keith');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'bloom', 'keith never bites first');
            const plant = await p.plant(h, roundState({ round: 1, signals: [broadcast('self', sig)] }));
            assert.equal(plant, 8, 'keith opens with a generous handful');
        } finally {
            p.dispose();
        }
    });

    test('keith: stays generous across a friendly match', async () => {
        const p = await loadOrSkip('keith');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            const res = await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 6,
                opponentActions: alwaysBloom(oppIds),
            });
            assert.ok(res.selfSignals.every((s) => s === 'bloom'), 'keith blooms among friends');
            assert.ok(res.selfPlants.every((x) => x >= 8), 'keith plants generously every friendly round');
        } finally {
            p.dispose();
        }
    });

    test('keith: bites a table of liars (bloom then stiff) after enough evidence', async () => {
        const p = await loadOrSkip('keith');
        try {
            const h = await p.create();
            const oppIds = ['liar1', 'liar2'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            const res = await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 9,
                // Promise BLOOM every round, then plant nothing — proven liars.
                opponentActions: (_r, _hist) => oppIds.map((id) => action(id, 0, 'bloom')),
            });
            // By the late rounds Keith has gathered MIN_SAMPLES of evidence and
            // keeps his seeds in his pocket: HOLD and a sub-contributor plant.
            const lateSignals = res.selfSignals.slice(-3);
            const latePlants = res.selfPlants.slice(-3);
            assert.ok(lateSignals.every((s) => s === 'hold'), 'keith stops promising a dead garden');
            assert.ok(latePlants.every((x) => x < 3), 'keith withholds from proven liars');
        } finally {
            p.dispose();
        }
    });

    test('keith: his signal never lies about his own plant', async () => {
        const p = await loadOrSkip('keith');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            // A mixed, swinging table to exercise both warm and cold branches.
            const res = await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 8,
                opponentActions: (r, _hist) =>
                    r % 2 === 0
                        ? oppIds.map((id) => action(id, 8, 'bloom'))
                        : oppIds.map((id) => action(id, 0, 'hold')),
            });
            // Keith's defining trait: BLOOM iff he actually contributed (plant >= 3),
            // HOLD iff he kept his seeds (plant < 3). His word always matches his deed.
            for (let i = 0; i < res.selfSignals.length; i++) {
                const promised = res.selfSignals[i] === 'bloom';
                const contributed = res.selfPlants[i] >= 3;
                assert.equal(promised, contributed, `round ${i + 1}: signal must match plant`);
            }
        } finally {
            p.dispose();
        }
    });
}

if (process.argv[1] && process.argv[1].endsWith('scenarios.test.mjs')) {
    register();
    const { failed } = await runAll('personality scenarios');
    if (failed > 0) process.exitCode = 1;
}
