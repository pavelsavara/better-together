// Minimal test collector + runner. No external deps; uses node:assert in tests.
//
// Tests register via test(name, fn). A test file exports register() which calls
// test(...) for each case; run.mjs imports register(), runs it, then runAll().
//
// Special outcomes:
//   skipTest(reason)              -> test is skipped (e.g. sample .wasm missing).
//   test.xfail(name, fn, reason)  -> "expected failure": a case known to fail
//                                    against the CURRENT jsco build (see the jsco
//                                    post-return bug in tests/README.md). If it
//                                    fails it is reported as xfail (NOT a failure);
//                                    if it unexpectedly passes it is reported as
//                                    XPASS so we know the upstream fix landed.

const SKIP = Symbol('skip');
const registry = [];

/** Register a test case. */
export function test(name, fn) {
    registry.push({ name, fn, xfail: false });
}

/** Register an expected-failure case (known upstream bug). */
test.xfail = function xfail(name, fn, reason = 'known upstream issue') {
    registry.push({ name, fn, xfail: true, xfailReason: reason });
};

/** Throw this (or return it) from a test body to mark it skipped. */
export function skip(reason) {
    const e = new Error(reason);
    e[SKIP] = true;
    return e;
}

/** Mark a test skipped from inside its body. */
export function skipTest(reason) {
    throw skip(reason);
}

function isSkip(err) {
    return err && (err[SKIP] === true || err.code === 'SAMPLE_MISSING');
}

/**
 * Run all registered tests. Returns { passed, failed, skipped, xfailed, xpassed }.
 * Prints a per-test line and a summary. Resets the registry afterward.
 */
export async function runAll(label = '') {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let xfailed = 0;
    let xpassed = 0;
    const cases = registry.slice();
    registry.length = 0;

    if (label) console.log(`\n# ${label}`);

    for (const { name, fn, xfail, xfailReason } of cases) {
        try {
            await fn();
            if (xfail) {
                xpassed++;
                console.log(`  XPASS ${name} (expected to fail: ${xfailReason} — upstream fix may have landed)`);
            } else {
                passed++;
                console.log(`  ok    ${name}`);
            }
        } catch (err) {
            if (isSkip(err)) {
                skipped++;
                console.log(`  skip  ${name} (${err.message})`);
            } else if (xfail) {
                xfailed++;
                console.log(`  xfail ${name} (${xfailReason})`);
            } else {
                failed++;
                console.log(`  FAIL  ${name}`);
                const msg = (err && err.stack) ? err.stack : String(err);
                console.log(msg.split('\n').map((l) => `        ${l}`).join('\n'));
            }
        }
    }

    const bits = [`${passed} passed`, `${failed} failed`, `${skipped} skipped`];
    if (xfailed) bits.push(`${xfailed} xfail`);
    if (xpassed) bits.push(`${xpassed} XPASS`);
    console.log(`  -> ${bits.join(', ')}`);
    return { passed, failed, skipped, xfailed, xpassed };
}
