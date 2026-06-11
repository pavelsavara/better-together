import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BotRecord, RegistryIndex, Scores, RegistryState, MatchLog } from '../types.ts';
import { initEmptyStore } from './bootstrap.ts';
import { loadIndex, loadScores, loadRegistryState, loadMeta, loadRecentMatchLogs, loadVfs } from './read.ts';
import { writeIndex, writeScores, writeRegistryState, writeMatchLog, writeVfs } from './write.ts';
import {
    stableStringify,
    serializeRegistryIndex,
    parseRegistryIndex,
    StoreValidationError,
} from './schema.ts';
import { indexPath } from './paths.ts';
import { VFS_BYTE_CAP, type Vfs } from '../host/vfs.ts';

async function withTempStore(fn: (base: string) => Promise<void>): Promise<void> {
    const base = await mkdtemp(join(tmpdir(), 'bt-store-'));
    try {
        await fn(base);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
}

function sampleBot(id: string, overrides: Partial<BotRecord> = {}): BotRecord {
    return {
        id,
        name: 'together.ferris',
        namespace: 'together',
        shortName: 'ferris',
        version: '1.0.0',
        author: 'Jane Doe',
        repo: 'https://github.com/jane/ferris',
        lore: 'Reputation-aware.',
        glyph: '🦀',
        icon: `icons/${id}.png`,
        iconSource: 'https://example.com/ferris.png',
        oci: 'ghcr.io/jane/ferris:1.0.0',
        ociDigest: 'sha256:9f86d08',
        ociEtag: '"33a64df5"',
        wasm: `wasm/${id}/1.0.0.wasm`,
        wasmSha256: 'abc123',
        submittedBy: 'jane',
        approvedBy: 'maintainer',
        issue: 123,
        validatedAt: '2026-06-10T11:58:00Z',
        lastDigestChangeAt: '2026-06-10T11:58:00Z',
        matchesSinceUpdate: 0,
        status: 'active',
        ...overrides,
    };
}

test('initEmptyStore writes readable empty data files', async () => {
    await withTempStore(async (base) => {
        await initEmptyStore(base, '2026-06-10T12:00:00Z');
        const index = await loadIndex(base);
        assert.equal(index.version, 1);
        assert.deepEqual(index.bots, []);
        const state = await loadRegistryState(base);
        assert.deepEqual(state?.bots, {});
        const meta = await loadMeta(base);
        assert.equal(meta?.totalMatches, 0);
        // scores.json is absent until the first run computes it.
        assert.equal(await loadScores(base), null);
    });
});

test('index.json round-trips with no data loss', async () => {
    await withTempStore(async (base) => {
        const index: RegistryIndex = { version: 1, updated: '2026-06-10T12:00:00Z', bots: [sampleBot('1a2b3c4d#together.ferris')] };
        await writeIndex(base, index);
        const back = await loadIndex(base);
        assert.deepEqual(back, index);
    });
});

test('serialization is deterministic and idempotent (minimal diff)', async () => {
    await withTempStore(async (base) => {
        const index: RegistryIndex = { version: 1, updated: 'now', bots: [sampleBot('id#together.ferris')] };
        await writeIndex(base, index);
        const first = await readFile(indexPath(base), 'utf8');
        // Re-serialize from a parsed copy: byte-identical → a no-op commit.
        const second = serializeRegistryIndex(parseRegistryIndex(first));
        assert.equal(first, second);
        // Key order in the source object must not affect the output.
        const reordered = stableStringify({ b: 1, a: 2, nested: { z: 1, a: 2 } });
        assert.equal(reordered, '{\n  "a": 2,\n  "b": 1,\n  "nested": {\n    "a": 2,\n    "z": 1\n  }\n}\n');
    });
});

test('scores.json round-trips', async () => {
    await withTempStore(async (base) => {
        const scores: Scores = {
            version: 1,
            computedAt: '2026-06-10T12:00:00Z',
            window: { matchesPerBot: 500 },
            minMatchesToRank: 50,
            baselineMeanGroupTotal: 64.2,
            leaderboard: [
                { id: 'a#together.bram', rank: 1, ranked: true, coPlayerScore: 3.1, coPlayerStdErr: 0.28, rawScore: 18.2, consistencyStd: 4.9, matchesInWindow: 240 },
                { id: 'b#together.khaos', rank: null, ranked: false, coPlayerScore: 0, coPlayerStdErr: 0, rawScore: 0, consistencyStd: 0, matchesInWindow: 12 },
            ],
        };
        await writeScores(base, scores);
        assert.deepEqual(await loadScores(base), scores);
    });
});

test('registry-state.json round-trips', async () => {
    await withTempStore(async (base) => {
        const state: RegistryState = {
            version: 1,
            checkedAt: '2026-06-10T12:00:00Z',
            bots: { 'a#together.bram': { oci: 'ghcr.io/jane/bram:latest', digest: 'sha256:9f86', etag: '"33a64"' } },
        };
        await writeRegistryState(base, state);
        assert.deepEqual(await loadRegistryState(base), state);
    });
});

test('match logs round-trip and load newest-first', async () => {
    await withTempStore(async (base) => {
        const mk = (id: string): MatchLog => ({
            matchId: id,
            seed: 'a1b2',
            engineVersion: '0.1.0',
            triggeredBy: 'x#together.bram',
            groupSize: 4,
            players: ['x#together.bram', 'y#together.corro'],
            playerDigests: { 'x#together.bram': 'sha256:9f86' },
            roundsPlayed: 9,
            rounds: [],
            scores: [{ id: 'x#together.bram', matchScore: 162 }],
            groupTotal: 680,
        });
        const when = new Date('2026-06-10T12:00:00Z');
        await writeMatchLog(base, 'run-1', mk('2026-06-10T12:00:00Z-0001'), when);
        await writeMatchLog(base, 'run-1', mk('2026-06-10T12:00:00Z-0002'), when);
        const logs = await loadRecentMatchLogs(base);
        assert.equal(logs.length, 2);
        assert.equal(logs[0]!.matchId, '2026-06-10T12:00:00Z-0002'); // newest first
        const limited = await loadRecentMatchLogs(base, 1);
        assert.equal(limited.length, 1);
        assert.equal(limited[0]!.matchId, '2026-06-10T12:00:00Z-0002');
    });
});

test('VFS round-trips, and an over-budget VFS is erased', async () => {
    await withTempStore(async (base) => {
        const fs: Vfs = new Map();
        fs.set('memory.json', '{"trust":1}');
        fs.set('nested/grudges.bin', new Uint8Array([1, 2, 3]));
        const r1 = await writeVfs(base, 'a#together.ferris', fs);
        assert.equal(r1.overflowed, false);
        const back = await loadVfs(base, 'a#together.ferris');
        assert.equal(new TextDecoder().decode(back.get('memory.json') as Uint8Array), '{"trust":1}');
        assert.deepEqual(Array.from(back.get('nested/grudges.bin') as Uint8Array), [1, 2, 3]);

        // Overflow: the whole VFS is erased rather than truncated.
        const big: Vfs = new Map([['huge', new Uint8Array(VFS_BYTE_CAP + 1)]]);
        const r2 = await writeVfs(base, 'a#together.ferris', big);
        assert.equal(r2.overflowed, true);
        const erased = await loadVfs(base, 'a#together.ferris');
        assert.equal(erased.size, 0);
    });
});

test('writeVfs skips bot-crafted path-traversal keys (no escape from vfs/<id>/)', async () => {
    await withTempStore(async (base) => {
        const malicious: Vfs = new Map<string, Uint8Array | string>([
            ['../../escape.txt', new Uint8Array([1])],
            ['/abs.txt', new Uint8Array([2])],
            ['ok.txt', '"safe"'],
        ]);
        await writeVfs(base, 'a#together.ferris', malicious);
        // Only the safe key persisted; the escaping ones were dropped.
        const back = await loadVfs(base, 'a#together.ferris');
        assert.deepEqual(Array.from(back.keys()), ['ok.txt']);
        // Nothing was written above the store base.
        const { access } = await import('node:fs/promises');
        await assert.rejects(() => access(join(base, '..', 'escape.txt')));
    });
});

test('a malformed file is rejected with a StoreValidationError', async () => {
    await withTempStore(async (base) => {
        await writeIndex(base, { version: 1, updated: 'now', bots: [] });
        // Corrupt the file: bots is not an array.
        const { writeFile } = await import('node:fs/promises');
        await writeFile(indexPath(base), '{"version":1,"updated":"now","bots":{}}');
        await assert.rejects(() => loadIndex(base), StoreValidationError);
    });
});
