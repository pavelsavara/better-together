import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGardenerSeat, withWatchdog, classifyError, TimeoutError, type GardenerSeat } from './seat.ts';
import { runMatch } from '../core/match.ts';

// Repo root: game/src/host -> game/src -> game -> better-together.
const ROOT = new URL('../../../', import.meta.url);

const SAMPLE_WASM: Record<string, string> = {
    ferris: 'samples/ferris/target/wasm32-wasip2/release/ferris.wasm',
    corro: 'samples/corro/target/wasm32-wasip1/release/corro.wasm',
    nib: 'samples/nib/nib.wasm',
    gopher: 'samples/gopher/gopher.wasm',
    andy: 'samples/andy/bin/Release/net10.0/wasi-wasm/native/andy.wasm',
    bram: 'samples/bram/bin/Release/net10.0/wasi-wasm/native/bram.wasm',
    attacker: 'samples/attacker/target/wasm32-wasip2/release/attacker.wasm',
};

function samplePath(name: string): string {
    return fileURLToPath(new URL(SAMPLE_WASM[name]!, ROOT));
}
function sampleExists(name: string): boolean {
    return existsSync(samplePath(name));
}
async function sampleBytes(name: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(samplePath(name)));
}

// Pick four built samples for the smoke match; skip if fewer than four exist.
const ROSTER = ['ferris', 'corro', 'nib', 'gopher'].filter(sampleExists);

test('a full match runs end-to-end across real gardener samples', { skip: ROSTER.length < 4 ? 'need 4 built samples' : false }, async () => {
    const seats: GardenerSeat[] = [];
    for (const name of ROSTER.slice(0, 4)) {
        // Disable the wall-clock budget: the debug jsco build is intentionally
        // slow (tracing), so timing is not what this functional test exercises.
        seats.push(await createGardenerSeat(await sampleBytes(name), { id: name, callBudgetMs: 0 }));
    }
    try {
        const { report, outcomes } = await runMatch({ matchId: 'smoke-1', seed: 'smoke-seed', seats });
        assert.equal(report.groupSize, 4);
        assert.ok(report.roundsPlayed >= 8);
        assert.equal(report.scores.length, 4);
        // Every round obeys the welfare identity.
        for (const o of outcomes) {
            const groupRound = o.roundScores.reduce((a, b) => a + b, 0);
            assert.ok(Math.abs(groupRound - (40 + o.garden.gardenTotal + o.garden.taxCollected)) < 1e-6);
        }
        // No benign sample should have tripped a sandbox/timing violation.
        for (const s of seats) {
            assert.equal(s.status, 'active');
        }
    } finally {
        for (const s of seats) s.dispose();
    }
});

test('the attacker is marked inactive on a sandbox-capability breach', { skip: !sampleExists('attacker') ? 'attacker not built' : false }, async () => {
    const attacker = await createGardenerSeat(await sampleBytes('attacker'), { id: 'attacker', callBudgetMs: 0 });
    const fillers: GardenerSeat[] = [];
    for (const name of ROSTER.slice(0, 3)) {
        fillers.push(await createGardenerSeat(await sampleBytes(name), { id: name, callBudgetMs: 0 }));
    }
    const seats: GardenerSeat[] = [attacker, ...fillers];
    try {
        // Match completes despite the attacker reaching for denied capabilities.
        const { report } = await runMatch({ matchId: 'attack-1', seed: 'lockdown', seats });
        assert.ok(report.roundsPlayed >= 8);
        assert.equal(attacker.status, 'inactive');
        assert.ok(attacker.violations.some((v) => v.kind === 'sandbox'), 'expected a sandbox violation');
    } finally {
        attacker.dispose();
        for (const s of fillers) s.dispose();
    }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('withWatchdog rejects a call that overruns the budget', async () => {
    await assert.rejects(
        () => withWatchdog('talk', 5, async () => {
            await sleep(50);
            return 'late';
        }),
        (e) => e instanceof TimeoutError,
    );
});

test('withWatchdog rejects a call that merely completes late', async () => {
    // Resolve just over budget without ever losing the timer race in the rare
    // scheduling case — the measured-elapsed guard still trips.
    await assert.rejects(
        () => withWatchdog('plant', 1, async () => {
            await sleep(20);
            return 0;
        }),
        (e) => e instanceof TimeoutError,
    );
});

test('withWatchdog returns a fast call value', async () => {
    const { value } = await withWatchdog('talk', 50, () => 'bloom');
    assert.equal(value, 'bloom');
});

test('withWatchdog with budget <= 0 never times out', async () => {
    const { value } = await withWatchdog('talk', 0, async () => {
        await sleep(20);
        return 'ok';
    });
    assert.equal(value, 'ok');
});

test('classifyError distinguishes timeout, sandbox, and plain traps', () => {
    assert.equal(classifyError(new TimeoutError('talk', 50)), 'timeout');
    assert.equal(classifyError(new Error('WASI interface "wasi:sockets/..." is disabled')), 'sandbox');
    assert.equal(classifyError(new Error('outbound HTTP refused')), 'sandbox');
    assert.equal(classifyError(new Error('index out of bounds')), 'trap');
    assert.equal(classifyError('unreachable'), 'trap');
});
