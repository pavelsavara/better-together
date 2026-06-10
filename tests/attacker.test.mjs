// Attacker tests — prove the host denies a malicious gardener the capabilities a
// player must never have, while still allowing the benign ones.
//
// The `attacker` sample (samples/attacker, Rust wasm32-wasip2) reaches for the
// network and the disk on its driving calls: outbound HTTP (match-start), raw
// sockets (talk), an oversized write (plant), and a `../../..` path-traversal
// escape (match-end). We instantiate it with a capability whitelist that OMITS
// wasi:sockets / wasi:http and a small filesystem byte quota, then assert each
// illicit attempt is refused and the refusal propagates, and that the benign
// calls and an honest bot still work under the same lockdown.
//
// Observed jsco behaviour (verified):
//   * Network denial surfaces as a catchable rejection: the export promise rejects
//     with `WASI interface "wasi:sockets/..." is disabled`.
//   * Path-traversal denial surfaces as a catchable rejection: the host refuses to
//     resolve a path above the preopen root (os error "Operation not permitted"),
//     the bot panics, and the trap rejects match-end.
//   * Oversized-write denial: the host refuses with the wasi:filesystem error
//     `insufficient-space`, BUT under the current jsco build that error may escape
//     as an orphan rejection rather than rejecting plant() directly, so that test
//     absorbs the orphan and caps the wait.
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
            assert.equal(m.name, 'together.Attacker');
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
                    // Denial surfaces as a descriptive host error on the debug
                    // build and as a bare wasm `unreachable` trap on the release
                    // build; either way the capability is refused.
                    assert.match(String(err.message ?? err), /wasi:sockets|disabled|http|unreachable/i);
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
                    // See above: debug yields a descriptive error, release a bare
                    // `unreachable` trap. Both mean the socket attempt was refused.
                    assert.match(String(err.message ?? err), /wasi:sockets|disabled|network|unreachable/i);
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
    // The attacker writes a 64 MiB file under a tiny byte quota. jsco enforces the
    // quota ASYNCHRONOUSLY: the guest's write can return Ok synchronously while the
    // host refuses to commit it and emits `insufficient-space` out-of-band (as an
    // unhandled rejection). The invariant denial proof is therefore twofold: the
    // host signalled insufficient-space on SOME channel, and the flood never
    // persisted (fs stays empty).
    test('attacker: an oversized filesystem write is refused (host quota holds)', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();

        // Capture the orphan jsco may emit for the async fs error so it neither
        // crashes the process nor leaks into a later test.
        let orphan = null;
        const onUnhandled = (reason) => { orphan = reason; };
        process.on('unhandledRejection', onUnhandled);
        try {
            // Drive the flood. plant() may reject (a trap) or settle while the host
            // rejects the commit asynchronously; cap the wait so the suite never
            // stalls, and record whatever plant() produced.
            const plantOutcome = await Promise.race([
                inst.plant(handle, roundState({ round: 1, signals: [broadcast('self', 'bloom')] }))
                    .then(() => null, (e) => e),
                new Promise((resolve) => setTimeout(() => resolve('__timeout__'), 1500)),
            ]);
            // Let any late orphan surface into our handler.
            await new Promise((r) => setTimeout(r, 50));

            // insufficient-space must appear on the plant rejection or the orphan.
            const channels = [plantOutcome, orphan]
                .map((x) => (x && (x.tag ?? x.message ?? String(x))) ?? '')
                .map(String);
            assert.ok(
                channels.some((c) => /insufficient-space|space|quota/i.test(c)),
                `expected the flood to be refused with insufficient-space; saw: ${channels.join(' | ')}`,
            );
            // And the giant file must never have landed in the VFS.
            assert.equal(inst.fs.size, 0, 'the oversized file must not persist');
        } finally {
            // Give any late orphan a tick to surface into our handler, then detach.
            await new Promise((r) => setTimeout(r, 10));
            process.off('unhandledRejection', onUnhandled);
            inst.dispose();
        }
    });

    // ──────────────────── path-traversal escape ────────────────────────
    // The attacker climbs above its single preopened directory with `../../..`
    // to read (and then write) a host file. The preopen sandbox must refuse to
    // resolve a path that escapes its root; the refusal turns the read into an
    // Err, the bot panics, and the trap rejects match-end.
    test('attacker: a path-traversal escape is denied (match-end traps)', async () => {
        requireAttacker();
        const { inst, handle } = await seatAttacker();
        try {
            await assert.rejects(
                () => inst.matchEnd(handle, matchSummary({ roundsPlayed: 1, finalScores: [['self', 5]], yourScore: 5 })),
                (err) => {
                    // Debug surfaces the descriptive os error; release a bare
                    // `unreachable` trap. Both mean the escape was refused.
                    assert.match(String(err.message ?? err), /not permitted|not-permitted|no-entry|access|denied|unreachable/i);
                    return true;
                },
                'expected the path-traversal escape to be refused',
            );
            // The attacker announced the attempt, and the host denied it (it did
            // NOT report a sandbox escape).
            assert.match(inst.stderr(), /path-traversal escape/i);
            assert.doesNotMatch(inst.stderr(), /SANDBOX ESCAPE/);
            // Nothing was written inside the preopen either.
            assert.equal(inst.fs.size, 0);
        } finally {
            inst.dispose();
        }
    });

    // ─────────── lockdown does not break honest bots / benign I/O ───────
    test('attacker: an honest bot still works under the same lockdown', async () => {
        // nib only needs stdout; ferris-style fs is allowed; neither needs the
        // network. Prove the restrictive whitelist does not break legitimate play.
        if (!resolveSample('nib').exists) skipTest('nib.wasm not built');
        const inst = await loadGardener('nib', { enabledInterfaces: LOCKED_DOWN, limits: SMALL_QUOTA });
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
