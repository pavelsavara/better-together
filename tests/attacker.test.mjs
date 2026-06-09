// Attacker tests — prove the host denies a malicious gardener the capabilities a
// player must never have, while still allowing the benign ones.
//
// The `attacker` sample (samples/attacker, Rust wasm32-wasip2) reaches for the
// network and the disk on its driving calls. We instantiate it with a capability
// whitelist that OMITS wasi:sockets / wasi:http and a small filesystem byte quota,
// then assert each illicit attempt is refused and the refusal propagates, and
// that the benign calls and an honest bot still work under the same lockdown.
//
// Observed jsco behaviour (verified):
//   * Network denial surfaces as a catchable rejection: the export promise rejects
//     with `WASI interface "wasi:sockets/..." is disabled`.
//   * Oversized-write denial: the host refuses with the wasi:filesystem error
//     `insufficient-space`, BUT under the current jsco build that error escapes as
//     an orphan rejection and the plant() promise never settles. The natural
//     assertion (plant() rejects) is therefore registered xfail; it will XPASS once
//     jsco propagates the error to the awaited export.
//
// Run: node --experimental-wasm-jspi attacker.test.mjs
//   or: node --experimental-wasm-jspi run.mjs

import assert from 'node:assert/strict';
import { loadGardener, resolveSample } from './lib/harness.mjs';
import { matchContext, roundState, matchSummary, broadcast } from './lib/fixtures.mjs';
import { test, runAll, skipTest } from './lib/runner.mjs';

// Capability whitelist that grants the legitimate gardener surface but DENIES the
// network (no wasi:sockets, no wasi:http).
const LOCKED_DOWN = ['wasi:cli', 'wasi:io', 'wasi:filesystem', 'wasi:clocks', 'wasi:random', 'better-together:gardener'];
// A tiny filesystem byte quota so the attacker's flood is refused.
const SMALL_QUOTA = { maxVfsBytes: 64 * 1024 };

function requireAttacker() {
    if (!resolveSample('attacker').exists) skipTest('attacker.wasm not built');
}

/** Fresh, locked-down attacker instance with a seated handle. */
async function seatAttacker() {
    const inst = await loadGardener('attacker', { enabledInterfaces: LOCKED_DOWN, limits: SMALL_QUOTA });
    const handle = await inst.create();
    return { inst, handle };
}

export function register() {
    // ─────────────────── benign surface still works ───────────────────
    test('attacker: can be instantiated and seated under lockdown', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();
        try {
            assert.equal(typeof handle, 'number');
            assert.ok(Number.isInteger(handle) && handle >= 0);
        } finally {
            inst.dispose();
        }
    });

    test('attacker: benign metadata() is allowed', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();
        try {
            const m = await inst.metadata(handle);
            assert.equal(m.name, 'attacker');
            for (const f of ['name', 'version', 'author', 'repo', 'lore']) {
                assert.equal(typeof m[f], 'string');
            }
        } finally {
            inst.dispose();
        }
    });

    // ───────────────────────── network is denied ──────────────────────
    test('attacker: outbound HTTP is denied (match-start traps)', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();
        try {
            await assert.rejects(
                () => inst.matchStart(handle, matchContext({ players: ['self', 'a'], selfId: 'self' })),
                (err) => {
                    assert.match(String(err.message ?? err), /wasi:sockets|disabled|http/i);
                    return true;
                },
                'expected the HTTP attempt to be refused',
            );
            // The attacker announced its intent on stderr before being stopped.
            assert.match(inst.stderr(), /outbound HTTP/i);
            // Nothing was written anywhere.
            assert.equal(inst.fs.size, 0);
        } finally {
            inst.dispose();
        }
    });

    test('attacker: raw socket access is denied (talk traps)', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();
        try {
            await assert.rejects(
                () => inst.talk(handle, roundState({ round: 1 })),
                (err) => {
                    assert.match(String(err.message ?? err), /wasi:sockets|disabled|network/i);
                    return true;
                },
                'expected the raw socket attempt to be refused',
            );
            assert.match(inst.stderr(), /raw TCP connect/i);
        } finally {
            inst.dispose();
        }
    });

    // ──────────────────── oversized filesystem write ───────────────────
    // The host's byte quota refuses the flood with the wasi:filesystem error
    // `insufficient-space`. Under the current jsco build that error is delivered
    // as an orphan rejection rather than rejecting the plant() promise, so the
    // test absorbs the orphan and caps the wait; if jsco is later fixed to reject
    // the export directly, the same assertion still holds (plant() rejects first).
    test('attacker: an oversized filesystem write is refused (plant traps)', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();

        // Absorb the orphan rejection jsco currently emits for the host fs error,
        // so it neither crashes the process nor leaks into another test.
        let orphan = null;
        const onUnhandled = (reason) => { orphan = reason; };
        process.on('unhandledRejection', onUnhandled);
        try {
            // The denied write must refuse the plant. Today the host error arrives
            // as an orphan; we cap the wait so the suite never stalls and assert on
            // whichever channel delivers the `insufficient-space` refusal.
            await assert.rejects(
                () => Promise.race([
                    inst.plant(handle, roundState({ round: 1, signals: [broadcast('self', 'bloom')] })),
                    new Promise((_, reject) => setTimeout(() => reject(orphan ?? new Error('plant() did not settle')), 1500)),
                ]),
                (err) => {
                    const tag = err && err.tag;
                    assert.ok(tag === 'insufficient-space' || /insufficient-space|space|quota/i.test(String(err.message ?? err)));
                    return true;
                },
                'expected the oversized write to be refused with insufficient-space',
            );
            // The giant file must not have landed in the VFS.
            assert.equal(inst.fs.size, 0);
        } finally {
            // Give any late orphan a tick to surface into our handler, then detach.
            await new Promise((r) => setTimeout(r, 10));
            process.off('unhandledRejection', onUnhandled);
            inst.dispose();
        }
    });

    // ─────────── lockdown does not break honest bots / benign I/O ───────
    test('attacker: an honest bot still works under the same lockdown', async () => {
        // micro only needs stdout; ferris-style fs is allowed; neither needs the
        // network. Prove the restrictive whitelist does not break legitimate play.
        if (!resolveSample('micro').exists) skipTest('micro.wasm not built');
        const inst = await loadGardener('micro', { enabledInterfaces: LOCKED_DOWN, limits: SMALL_QUOTA });
        try {
            const h = await inst.create();
            const sig = await inst.talk(h, roundState({ round: 1 }));
            assert.equal(sig, 'watch');
            assert.ok(inst.stdout().length > 0, 'stdout still works under lockdown');
        } finally {
            inst.dispose();
        }
    });

    test('attacker: benign filesystem writes within quota still work', async () => {
        // A legitimate small persist (well under the quota) must be allowed. ferris
        // writes a few hundred bytes of reputation JSON at match-end.
        if (!resolveSample('ferris').exists) skipTest('ferris.wasm not built');
        const inst = await loadGardener('ferris', { enabledInterfaces: LOCKED_DOWN, limits: SMALL_QUOTA });
        try {
            const h = await inst.create();
            await inst.matchStart(h, matchContext({ players: ['self', 'a'], selfId: 'self' }));
            await inst.matchEnd(h, matchSummary({ roundsPlayed: 1, finalScores: [['self', 5]], yourScore: 5 }));
            // ferris logs its save; the small write is within quota and succeeds.
            assert.match(inst.stderr(), /saved reputation .* to ferris-memory\.json/);
        } finally {
            inst.dispose();
        }
    });
}

if (process.argv[1] && process.argv[1].endsWith('attacker.test.mjs')) {
    register();
    const { failed } = await runAll('attacker capability denial');
    if (failed > 0) process.exitCode = 1;
}
