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
//   khaos  : random per-opponent friend/foe with cross-match memory; loads
//            seeded verdicts from its memory file and keeps everything against a known foe.
//   keith  : ledger-keeping forgiver; persists a TSV ledger at match-end and
//            distrusts a seeded known cheat (pockets his seeds).
//   andy   : Tit-for-Tat hedgehog; persists a JSON friend-book and gives a
//            remembered friend a +2 bonus over the mirror.
//   dusty  : graduated Tit-for-Tat mouse; persists a binary memory file whose
//            seeded coop-rate brightens or chills its opening nibble.
//   bram   : coalition organizer; bloom + generous anchor every round, maxes out
//            when a guild member (micro/gopher) is seated, and votes to tax the
//            fattest hoarder (never a member or arbiter ally); persists a roster.
//   reynard: velvet-gloved skimmer; always bloom, plants a credible handful but
//            trims to the floor on a fat table (unless an arbiter is seated),
//            never below the contributor floor, and always abstains from voting.
//
// Run: node --experimental-wasm-jspi scenarios.test.mjs
//   or: node --experimental-wasm-jspi run.mjs

import assert from 'node:assert/strict';
import { loadGardener, resolveSample } from './lib/harness.mjs';
import {
    matchContext, roundState, matchSummary, action, broadcast, roundResult,
    runMatch, alwaysBloom, alwaysKeep, SIGNALS,
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

    // Multi-call: khaos plays a full 6-round match (talk/plant/match-end) on a
    // single instance, then persists. This is the case the old jsco post-return
    // bug used to poison; it now runs cleanly end to end.
    test('khaos: plays a full match and persists its mood memory', async () => {
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
            // matchStart rolled a verdict for each new opponent (the save path is
            // therefore dirty), and match-end ran without logging a persist failure.
            assert.match(p.stdout(), /I'll remember this FOREVER/);
            assert.doesNotMatch(p.stderr(), /failed to persist memory/);
        } finally {
            p.dispose();
        }
    });

    // Cross-match memory (read path): jsco's in-memory VFS does not mirror guest
    // writes back into the seed Map, but it DOES serve seeded reads. Seed a verdict
    // file marking opponent 'a' as a foe and prove khaos loads it: a seated foe
    // makes khaos keep (plant 0), and it never re-rolls 'a' (no "new face: a").
    test('khaos: loads remembered verdicts from a seeded memory file', async () => {
        const seed = new TextEncoder().encode(JSON.stringify({ version: 1, verdicts: { a: 'foe' } }));
        const p = await loadOrSkip('khaos', { fs: new Map([['khaos-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            const plant = await p.plant(h, roundState({ round: 1, signals: [broadcast('a', 'bloom')] }));
            assert.equal(plant, 0, 'a remembered foe makes khaos keep');
            const out = p.stdout();
            assert.doesNotMatch(out, /A new face: a[!\b]/, "khaos loaded 'a' from memory, did not re-roll it");
            assert.match(out, /A new face: b/, "'b' was unknown and got a fresh roll");
        } finally {
            p.dispose();
        }
    });

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

    // Cross-match persistence. jsco's in-memory VFS serves SEEDED reads but does
    // not mirror guest writes back into the seed Map, so the write path is proven
    // via each bot's own save log line, and the read path by seeding a memory
    // file and asserting the behaviour (or the load count) it produces.

    test('keith: writes his ledger at match-end without trapping', async () => {
        // keith logs the save via printf, but wasi-libc fully buffers stdout and
        // jsco does not mirror guest writes back into the seed Map, so the save is
        // not observable by read-back. This proves the write path executes: a fresh
        // ledger ("0 names"), a full match, and match-end (save_ledger) all run clean.
        const p = await loadOrSkip('keith');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            assert.match(p.stdout(), /0 names already in my book/, 'a fresh keith starts with a clean ledger');
            await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 5,
                opponentActions: alwaysBloom(oppIds),
            });
            await p.matchEnd(h, matchSummary({ roundsPlayed: 5, finalScores: [['self', 30]], yourScore: 30 }));
            // Reaching here means save_ledger ran and the instance is still healthy.
            assert.ok(true);
        } finally {
            p.dispose();
        }
    });

    test('keith: loads a seeded ledger and distrusts a known cheat', async () => {
        // A grubby TSV ledger (id rounds contribs blooms lies) naming a long-term
        // cheat (10 rounds seen, contributed once -> 10% coop) and a clean name.
        const ledger = 'cheat\t10\t1\t0\t0\nfriend\t10\t9\t9\t0\n';
        const seated = ['self', 'cheat', 'b'];
        // Round-2 state: last round EVERYONE planted generously, so without the
        // ledger keith rewards the warm table. The remembered cheat must override.
        const history = [roundResult([
            action('cheat', 8, 'bloom'), action('b', 8, 'bloom'), action('self', 8, 'bloom'),
        ])];

        let p = await loadOrSkip('keith', { fs: new Map([['keith-ledger.tsv', ledger]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            assert.match(p.stdout(), /2 names already in my book/, 'keith read both names from the seeded ledger');
            await p.talk(h, roundState({ round: 2, history }));
            assert.equal(await p.plant(h, roundState({ round: 2, history })), 2,
                'a remembered cheat at the table makes keith pocket his seeds');
        } finally {
            p.dispose();
        }

        // Control: no ledger -> the same generous table earns a generous plant.
        p = await loadOrSkip('keith');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            await p.talk(h, roundState({ round: 2, history }));
            assert.equal(await p.plant(h, roundState({ round: 2, history })), 8,
                'with no memory the warm table earns a generous plant');
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── andy ────────────────────────────
    test('andy: persists his friend-book at match-end', async () => {
        const p = await loadOrSkip('andy');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 5,
                opponentActions: alwaysBloom(oppIds),
            });
            await p.matchEnd(h, matchSummary({ roundsPlayed: 5, finalScores: [['self', 30]], yourScore: 30 }));
            assert.match(p.stdout(), /curling up for the night — \d+ friend\(s\) in the burrow book/,
                'andy saved his friend-book on the way to bed');
        } finally {
            p.dispose();
        }
    });

    test('andy: loads a seeded friend-book and warms to a remembered friend', async () => {
        // A friend-book trusting 'pal' well above the friend threshold (0.65).
        const seed = JSON.stringify({ version: 1, friends: { pal: 0.9 } });
        const seated = ['self', 'pal', 'x'];
        // Last round everyone planted 6 (a clean contributor round): the
        // Tit-for-Tat mirror is 6 and nobody is a within-match foe.
        const history = [roundResult([
            action('pal', 6, 'bloom'), action('x', 6, 'bloom'), action('self', 6, 'bloom'),
        ])];

        let p = await loadOrSkip('andy', { fs: new Map([['andy-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            await p.talk(h, roundState({ round: 2, history }));
            assert.equal(await p.plant(h, roundState({ round: 2, history })), 8,
                'a remembered friend earns andy a +2 bonus on top of the mirror');
        } finally {
            p.dispose();
        }

        // Control: same table, no memory -> plain Tit-for-Tat mirror, no bonus.
        p = await loadOrSkip('andy');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            await p.talk(h, roundState({ round: 2, history }));
            assert.equal(await p.plant(h, roundState({ round: 2, history })), 6,
                'without memory andy just mirrors the table');
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── dusty ────────────────────────────
    // Dusty writes a 16-byte binary memory file ("DST1" magic + three u32s) and
    // keeps no save log, so its persistence is observed through the OPENING nibble
    // it chooses: a kind remembered history makes it brave, a cold one wary.
    test('dusty: a seeded memory file shapes its opening nibble', async () => {
        // 16-byte little-endian record: magic 0x44535431, matches, coopRounds, totalRounds.
        const dustyMem = (matches, coop, total) => {
            const buf = new Uint8Array(16);
            const dv = new DataView(buf.buffer);
            dv.setUint32(0, 0x44535431, true);
            dv.setUint32(4, matches, true);
            dv.setUint32(8, coop, true);
            dv.setUint32(12, total, true);
            return buf;
        };
        const openerWith = async (mem) => {
            const p = await loadOrSkip('dusty', mem ? { fs: new Map([['dusty.mem', mem]]) } : undefined);
            try {
                const h = await p.create();
                await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
                // Round 1 has no history, so the plant is exactly the chosen opener.
                return await p.plant(h, roundState({ round: 1 }));
            } finally {
                p.dispose();
            }
        };

        assert.equal(await openerWith(null), 4, 'no memory -> neutral opener');
        assert.equal(await openerWith(dustyMem(5, 90, 100)), 6, 'a kind remembered world -> brave opener');
        assert.equal(await openerWith(dustyMem(5, 10, 100)), 2, 'a cold remembered world -> wary opener');
    });

    test('dusty: writes its memory file at match-end without trapping', async () => {
        // No save log to assert, so this proves the write path simply executes:
        // a full match plus match-end (which calls saveMemory) completes cleanly.
        const p = await loadOrSkip('dusty');
        try {
            const h = await p.create();
            const oppIds = ['a', 'b'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 5,
                opponentActions: alwaysBloom(oppIds),
            });
            await p.matchEnd(h, matchSummary({ roundsPlayed: 5, finalScores: [['self', 25]], yourScore: 25 }));
            // Reaching here means saveMemory ran and the instance is still healthy.
            assert.ok(true);
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── bram ────────────────────────────
    // The coalition organizer: honest bloom + a generous anchor every round,
    // maxing out when a guild member is seated, and a vote that taxes the
    // fattest hoarder while sparing members and arbiter allies.
    test('bram: always signals bloom and leads with a generous anchor', async () => {
        const p = await loadOrSkip('bram');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'bloom', 'bram rallies the table with an honest bloom');
            const plant = await p.plant(h, roundState({ round: 1, signals: [broadcast('self', sig)] }));
            assert.ok(plant >= 9, `bram anchors the garden generously, got ${plant}`);
        } finally {
            p.dispose();
        }
    });

    test('bram: maxes out when a guild member (micro) is seated', async () => {
        const p = await loadOrSkip('bram');
        try {
            const h = await p.create();
            // Micro is one of Bram's unwitting members — he rallies the bloc to 10.
            await p.matchStart(h, matchContext({ players: ['self', 'micro', 'b'], selfId: 'self' }));
            await p.talk(h, roundState({ round: 1 }));
            const plant = await p.plant(h, roundState({ round: 1 }));
            assert.equal(plant, 10, 'with a member at the table bram keeps the payout high');
        } finally {
            p.dispose();
        }
    });

    test('bram: votes to tax the fattest hoarder', async () => {
        const p = await loadOrSkip('bram');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'greedy', 'thrifty'], selfId: 'self' }));
            // This round's plants: greedy kept 9 (planted 1), thrifty kept 4 (planted 6).
            const plants = [action('self', 9, 'bloom'), action('greedy', 1, 'bloom'), action('thrifty', 6, 'bloom')];
            const ballot = await p.vote(h, roundState({ round: 1, plants }));
            assert.equal(ballot, 'greedy', 'bram aims the tax at the player who kept the most');
        } finally {
            p.dispose();
        }
    });

    test('bram: never votes to tax a guild member', async () => {
        const p = await loadOrSkip('bram');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'micro', 'thrifty'], selfId: 'self' }));
            // Micro hoards the most (kept 9) but is a member; thrifty (kept 5) is fair game.
            const plants = [action('self', 9, 'bloom'), action('micro', 1, 'watch'), action('thrifty', 5, 'bloom')];
            const ballot = await p.vote(h, roundState({ round: 1, plants }));
            assert.equal(ballot, 'thrifty', 'bram never crosses a member, even the fattest one');
        } finally {
            p.dispose();
        }
    });

    test('bram: abstains when only untaxable holders remain', async () => {
        const p = await loadOrSkip('bram');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            // Everyone planted 9+ (kept <= 1 <= untaxable-min 2) -> nothing to reclaim.
            const plants = [action('self', 9, 'bloom'), action('a', 9, 'bloom'), action('b', 10, 'bloom')];
            const ballot = await p.vote(h, roundState({ round: 1, plants }));
            assert.equal(ballot, null, 'no hoarder worth taxing -> bram abstains');
        } finally {
            p.dispose();
        }
    });

    test('bram: persists his roster at match-end', async () => {
        const p = await loadOrSkip('bram');
        try {
            const h = await p.create();
            const oppIds = ['micro', 'greedy'];
            await p.matchStart(h, matchContext({ players: ['self', ...oppIds], selfId: 'self' }));
            await runMatch(p, h, {
                players: ['self', ...oppIds],
                selfId: 'self',
                rounds: 5,
                opponentActions: alwaysBloom(oppIds),
            });
            await p.matchEnd(h, matchSummary({ roundsPlayed: 5, finalScores: [['self', 30]], yourScore: 30 }));
            assert.match(p.stdout(), /dam's full for the night — \d+ member\(s\) on the roster, \d+ free-rider\(s\) in the ledger/,
                'bram saved his roster on the way to bed');
        } finally {
            p.dispose();
        }
    });

    test('bram: loads a seeded roster and remembers a past free-rider', async () => {
        // A roster naming 'skimmer' as taxed before and 'gopher' as a member.
        const seed = JSON.stringify({ version: 1, members: ['gopher'], taxed: ['skimmer'] });
        const seated = ['self', 'skimmer', 'thrifty'];
        // Both kept the SAME amount this round (planted 5, kept 5); the tie-break
        // is the remembered free-rider, so the seeded roster decides the ballot.
        const plants = [action('self', 9, 'bloom'), action('skimmer', 5, 'bloom'), action('thrifty', 5, 'bloom')];

        let p = await loadOrSkip('bram', { fs: new Map([['bram-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            const ballot = await p.vote(h, roundState({ round: 1, plants }));
            assert.equal(ballot, 'skimmer', 'a remembered free-rider is taxed first on a tie');
        } finally {
            p.dispose();
        }

        // Control: no roster -> the tie resolves by id order (skimmer < thrifty),
        // proving the seeded memory is what tipped the choice above (same result
        // here is coincidental on ordering, so use a table where order differs).
        const plants2 = [action('self', 9, 'bloom'), action('aaa', 5, 'bloom'), action('skimmer', 5, 'bloom')];
        p = await loadOrSkip('bram', { fs: new Map([['bram-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'aaa', 'skimmer'], selfId: 'self' }));
            const ballot = await p.vote(h, roundState({ round: 1, plants: plants2 }));
            assert.equal(ballot, 'skimmer', 'the remembered free-rider beats a lower-id stranger on a tie');
        } finally {
            p.dispose();
        }
    });

    // ──────────────────────────── reynard ────────────────────────────
    // The velvet-gloved skimmer: always credible (bloom), plants a believable
    // handful, trims to the floor on a fat table (unless an arbiter is watching),
    // never below the contributor floor, and never calls a vote.
    test('reynard: talk is always a credible bloom', async () => {
        const p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            const sig = await p.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'bloom', 'reynard always looks like a cooperator');
        } finally {
            p.dispose();
        }
    });

    test('reynard: round 1 plants a credible handful (5)', async () => {
        const p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            const plant = await p.plant(h, roundState({ round: 1 }));
            assert.equal(plant, 5, 'an opening that reads as an ordinary cooperator');
        } finally {
            p.dispose();
        }
    });

    test('reynard: trims to the floor on a fat table', async () => {
        const p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            // Last round the others were over-generous (avg 8 >= 7) and no arbiter.
            const history = [roundResult([
                action('self', 5, 'bloom'), action('a', 8, 'bloom'), action('b', 8, 'bloom'),
            ])];
            const plant = await p.plant(h, roundState({ round: 2, history }));
            assert.equal(plant, 3, 'reynard skims a fat table down to the contributor floor');
        } finally {
            p.dispose();
        }
    });

    test('reynard: never skims under an arbiter\'s gaze', async () => {
        const p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            // Keith (an arbiter) is seated, so reynard stays at the credible handful.
            await p.matchStart(h, matchContext({ players: ['self', 'keith', 'b'], selfId: 'self' }));
            const history = [roundResult([
                action('self', 5, 'bloom'), action('keith', 8, 'bloom'), action('b', 8, 'bloom'),
            ])];
            const plant = await p.plant(h, roundState({ round: 2, history }));
            assert.equal(plant, 5, 'an arbiter at the table keeps reynard honest-looking');
        } finally {
            p.dispose();
        }
    });

    test('reynard: never drops below the contributor floor', async () => {
        const p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'a', 'b'], selfId: 'self' }));
            // Even on a maximally fat table reynard stays a contributor (>= 3).
            const history = [roundResult([
                action('self', 5, 'bloom'), action('a', 10, 'bloom'), action('b', 10, 'bloom'),
            ])];
            const plant = await p.plant(h, roundState({ round: 2, history }));
            assert.ok(plant >= 3, `reynard never gives the ledger a defector to flag, got ${plant}`);
        } finally {
            p.dispose();
        }
    });

    test('reynard: always abstains from the vote', async () => {
        const p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: ['self', 'hoarder', 'b'], selfId: 'self' }));
            // A blatant hoarder is at the table, but the skimmer never calls a vote.
            const plants = [action('self', 5, 'bloom'), action('hoarder', 0, 'hold'), action('b', 6, 'bloom')];
            const ballot = await p.vote(h, roundState({ round: 1, plants }));
            assert.equal(ballot, null, 'reynard stays invisible — he never points a finger');
        } finally {
            p.dispose();
        }
    });

    test('reynard: opens by skimming a table remembered as generous', async () => {
        // A memory file remembering 'rich' as a generous-table neighbour.
        const seed = JSON.stringify({ version: 1, rich: ['rich'] });
        const seated = ['self', 'rich', 'b'];

        let p = await loadOrSkip('reynard', { fs: new Map([['reynard-memory.json', seed]]) });
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            // Round 1, no history: a remembered-rich table is skimmed from the start.
            const plant = await p.plant(h, roundState({ round: 1 }));
            assert.equal(plant, 3, 'a fondly remembered table is skimmed from round one');
        } finally {
            p.dispose();
        }

        // Control: no memory -> the same opening pays the credible handful first.
        p = await loadOrSkip('reynard');
        try {
            const h = await p.create();
            await p.matchStart(h, matchContext({ players: seated, selfId: 'self' }));
            const plant = await p.plant(h, roundState({ round: 1 }));
            assert.equal(plant, 5, 'an unremembered table earns the credible handful first');
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
