import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTournament } from './run.ts';
import { mapChecker, type ManifestStatus } from './scan/detect.ts';
import { cacheWasm, writeIndex } from './store/write.ts';
import { loadScores, loadRegistryState, loadRecentMatchLogs, loadIndex } from './store/read.ts';
import { manufactureId } from './validate/id.ts';
import { sha256Hex } from './validate/checks.ts';
import type { BotRecord, RegistryIndex } from './types.ts';

const ROOT = new URL('../../', import.meta.url);
const SAMPLE_WASM: Record<string, string> = {
    ferris: 'samples/ferris/target/wasm32-wasip2/release/ferris.wasm',
    corro: 'samples/corro/target/wasm32-wasip1/release/corro.wasm',
    nib: 'samples/nib/nib.wasm',
    gopher: 'samples/gopher/gopher.wasm',
    andy: 'samples/andy/bin/Release/net10.0/wasi-wasm/native/andy.wasm',
};
const path = (n: string) => fileURLToPath(new URL(SAMPLE_WASM[n]!, ROOT));
const have = (n: string) => existsSync(path(n));

const NAMES = ['ferris', 'corro', 'nib', 'gopher', 'andy'];
const HAVE = NAMES.every(have);

function record(id: string, oci: string): BotRecord {
    return {
        id,
        name: 'together.x',
        namespace: 'together',
        shortName: 'x',
        version: '1.0.0',
        author: 'a',
        repo: '',
        lore: '',
        glyph: '🌱',
        icon: null,
        iconSource: null,
        oci,
        ociDigest: 'sha256:seed',
        ociEtag: null,
        wasm: `wasm/${id}/1.0.0.wasm`,
        wasmSha256: '',
        submittedBy: 'a',
        approvedBy: 'm',
        issue: 1,
        validatedAt: 'now',
        lastDigestChangeAt: 'now',
        matchesSinceUpdate: 0,
        status: 'active',
    };
}

async function seedStore(base: string): Promise<{ ids: string[]; ociById: Map<string, string> }> {
    const bots: BotRecord[] = [];
    const ociById = new Map<string, string>();
    for (const n of NAMES) {
        const oci = `ghcr.io/test/${n}:1.0.0`;
        const id = manufactureId(oci, `together.${n}`);
        const bytes = new Uint8Array(await readFile(path(n)));
        await cacheWasm(base, id, '1.0.0', bytes);
        bots.push({ ...record(id, oci), wasmSha256: sha256Hex(bytes) });
        ociById.set(id, oci);
    }
    const index: RegistryIndex = { version: 1, updated: 'now', bots };
    await writeIndex(base, index);
    return { ids: bots.map((b) => b.id), ociById };
}

test('a change-gated run plays matches and writes scores + logs + registry-state', { skip: !HAVE ? 'need 5 built samples' : false }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'bt-run-'));
    try {
        const { ids } = await seedStore(base);

        // First run: no prior registry-state → every active bot is "new" (changed),
        // so the run plays matches.
        const result = await runTournament({
            base,
            check: mapChecker(new Map()),
            masterSeed: 'run-master',
            budget: 6,
            callBudgetMs: 0,
            scoring: { windowPerBot: 500, minMatchesToRank: 1 },
            now: () => '2026-06-11T00:00:00Z',
        });

        assert.equal(result.skipped, false);
        assert.equal(result.matchesRun, 6);
        assert.equal(result.changed.length, ids.length);

        const scores = await loadScores(base);
        assert.ok(scores, 'scores.json written');
        assert.ok(scores!.leaderboard.length > 0);

        const state = await loadRegistryState(base);
        assert.ok(state, 'registry-state.json written');

        const logs = await loadRecentMatchLogs(base);
        assert.equal(logs.length, 6);
        for (const log of logs) {
            assert.ok(log.players.length >= 4);
            assert.ok(log.roundsPlayed >= 8);
            assert.ok(Number.isFinite(log.groupTotal));
        }
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('a run where nothing changed exits without committing', { skip: !HAVE ? 'need 5 built samples' : false }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'bt-run-skip-'));
    try {
        await seedStore(base);
        const seed = 'run-master';
        const noChange = () => '2026-06-11T00:00:00Z';
        // Prime the registry-state with a first run.
        await runTournament({ base, check: mapChecker(new Map()), masterSeed: seed, budget: 4, callBudgetMs: 0, scoring: { windowPerBot: 500, minMatchesToRank: 1 }, now: noChange });
        const logsAfterFirst = (await loadRecentMatchLogs(base)).length;

        // Second run with an empty checker → all digests unchanged → skip.
        const result = await runTournament({ base, check: mapChecker(new Map<string, ManifestStatus>()), masterSeed: seed, budget: 4, callBudgetMs: 0, now: () => '2026-06-11T01:00:00Z' });
        assert.equal(result.skipped, true);
        assert.equal(result.matchesRun, 0);
        const logsAfterSecond = (await loadRecentMatchLogs(base)).length;
        assert.equal(logsAfterSecond, logsAfterFirst, 'no new logs on a skipped run');
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('a provenance-mismatched bot is skipped (served wasm sha256 != index pin)', { skip: !HAVE ? 'need 5 built samples' : false }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'bt-run-prov-'));
    try {
        await seedStore(base);
        // Corrupt one bot's pinned sha so its served bytes fail the provenance audit.
        const index = await loadIndex(base);
        index.bots[0]!.wasmSha256 = 'deadbeefdeadbeef';
        const corruptedId = index.bots[0]!.id;
        await writeIndex(base, index);

        const result = await runTournament({
            base,
            check: mapChecker(new Map()),
            masterSeed: 'prov',
            budget: 6,
            callBudgetMs: 0,
            scoring: { windowPerBot: 500, minMatchesToRank: 1 },
            now: () => '2026-06-11T00:00:00Z',
        });
        assert.equal(result.skipped, false);
        // The corrupted bot must never be seated in any logged match.
        const logs = await loadRecentMatchLogs(base);
        for (const log of logs) assert.ok(!log.players.includes(corruptedId), 'corrupted bot must not be seated');
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('the same master seed reproduces identical match logs', { skip: !HAVE ? 'need 5 built samples' : false }, async () => {
    async function once(): Promise<string[]> {
        const base = await mkdtemp(join(tmpdir(), 'bt-run-rep-'));
        try {
            await seedStore(base);
            await runTournament({ base, check: mapChecker(new Map()), masterSeed: 'determinism', budget: 4, callBudgetMs: 0, scoring: { windowPerBot: 500, minMatchesToRank: 1 }, now: () => '2026-06-11T00:00:00Z' });
            const logs = await loadRecentMatchLogs(base);
            return logs.map((l) => `${l.matchId}:${l.groupTotal}:${l.players.join(',')}`);
        } finally {
            await rm(base, { recursive: true, force: true });
        }
    }
    assert.deepEqual(await once(), await once());
});

test('a changed bot is ingested: fresh bytes are pulled, re-cached, and the index provenance updated', { skip: !HAVE ? 'need 5 built samples' : false }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'bt-run-ingest-'));
    try {
        const { ociById } = await seedStore(base);
        // The puller returns each bot's own sample bytes with a fresh ETag/digest,
        // standing in for a freshly published component.
        const bytesByOci = new Map<string, Uint8Array>();
        for (const n of NAMES) {
            const oci = `ghcr.io/test/${n}:1.0.0`;
            bytesByOci.set(oci, new Uint8Array(await readFile(path(n))));
        }
        const pull = async (ref: string) => {
            const bytes = bytesByOci.get(ref);
            if (!bytes) throw new Error(`no bytes for ${ref}`);
            return { bytes, digest: `sha256:${sha256Hex(bytes)}`, etag: '"fresh"' };
        };

        const result = await runTournament({
            base,
            check: mapChecker(new Map()), // every bot is first-seen → changed
            pull,
            masterSeed: 'ingest',
            budget: 4,
            callBudgetMs: 0,
            scoring: { windowPerBot: 500, minMatchesToRank: 1 },
            now: () => '2026-06-11T00:00:00Z',
        });
        assert.equal(result.skipped, false);

        const index = await loadIndex(base);
        for (const [id, oci] of ociById) {
            const rec = index.bots.find((b) => b.id === id)!;
            const expectedSha = sha256Hex(bytesByOci.get(oci)!);
            assert.equal(rec.wasmSha256, expectedSha, `${id} wasmSha256 reflects the pulled bytes`);
            assert.equal(rec.ociEtag, '"fresh"', `${id} ETag updated from the pull`);
            assert.equal(rec.ociDigest, `sha256:${expectedSha}`, `${id} digest updated from the pull`);
            assert.equal(rec.validatedAt, '2026-06-11T00:00:00Z', `${id} validatedAt stamped`);
        }
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('ingestion is best-effort: a bot whose pull fails keeps its cached bytes and still plays', { skip: !HAVE ? 'need 5 built samples' : false }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'bt-run-ingest-fail-'));
    try {
        const { ids } = await seedStore(base);
        // A puller that always fails (mirrors the still-stubbed OCI-registry path).
        const pull = async (ref: string): Promise<never> => {
            throw new Error(`cannot pull ${ref}`);
        };
        const result = await runTournament({
            base,
            check: mapChecker(new Map()),
            pull,
            masterSeed: 'ingest-fail',
            budget: 6,
            callBudgetMs: 0,
            scoring: { windowPerBot: 500, minMatchesToRank: 1 },
            now: () => '2026-06-11T00:00:00Z',
        });
        // Matches still ran against the cached bytes despite every pull failing.
        assert.equal(result.skipped, false);
        assert.equal(result.changed.length, ids.length);
        const logs = await loadRecentMatchLogs(base);
        assert.ok(logs.length > 0, 'matches ran on the cached bytes');
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});
