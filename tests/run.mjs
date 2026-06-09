// Single entry point for the Better Together integration suite.
//
// Imports every *.test.mjs module, lets it register its cases, runs them per
// file, and aggregates the results. Exits non-zero if any case actually FAILED.
// Expected-failures (xfail) and skips (e.g. a sample whose .wasm isn't built) do
// not fail the build; an unexpected pass of an xfail (XPASS) is reported so an
// upstream fix is noticed, but it does not fail the build either.
//
// Run: node --experimental-wasm-jspi run.mjs
//   (npm test wires this up with the flag.)

import { runAll } from './lib/runner.mjs';

// Test files in run order. Each exports register() which registers its cases.
const FILES = [
    ['./players.test.mjs', 'player API conformance'],
    ['./scenarios.test.mjs', 'personality scenarios'],
    ['./attacker.test.mjs', 'attacker capability denial'],
];

const totals = { passed: 0, failed: 0, skipped: 0, xfailed: 0, xpassed: 0 };

for (const [file, label] of FILES) {
    const mod = await import(file);
    if (typeof mod.register !== 'function') {
        console.error(`! ${file} does not export register()`);
        totals.failed++;
        continue;
    }
    mod.register();
    const r = await runAll(label);
    totals.passed += r.passed;
    totals.failed += r.failed;
    totals.skipped += r.skipped;
    totals.xfailed += r.xfailed ?? 0;
    totals.xpassed += r.xpassed ?? 0;
}

const bits = [
    `${totals.passed} passed`,
    `${totals.failed} failed`,
    `${totals.skipped} skipped`,
];
if (totals.xfailed) bits.push(`${totals.xfailed} xfail`);
if (totals.xpassed) bits.push(`${totals.xpassed} XPASS`);

console.log(`\n=== TOTAL: ${bits.join(', ')} ===`);
if (totals.xpassed) {
    console.log('Note: an xfail unexpectedly passed (XPASS) — a known upstream issue may be fixed; consider promoting it to a normal test.');
}

process.exit(totals.failed > 0 ? 1 : 0);
