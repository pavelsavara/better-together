import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChanges, mapChecker, type ManifestStatus } from './detect.ts';
import type { BotRecord, RegistryState } from '../types.ts';

function bot(id: string, oci: string, digest: string | null, status: BotRecord['status'] = 'active'): BotRecord {
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
        ociDigest: digest,
        ociEtag: null,
        wasm: `wasm/${id}/1.0.0.wasm`,
        wasmSha256: '',
        submittedBy: 'a',
        approvedBy: 'm',
        issue: 1,
        validatedAt: 'now',
        lastDigestChangeAt: 'now',
        matchesSinceUpdate: 0,
        status,
    };
}

test('a never-before-seen bot counts as changed and seeds the state', async () => {
    const bots = [bot('a#x', 'ghcr.io/a:1', 'sha256:aaa')];
    const result = await detectChanges(bots, null, mapChecker(new Map()), 'now');
    assert.deepEqual(result.changed, ['a#x']);
    assert.equal(result.state.bots['a#x']!.digest, 'sha256:aaa');
});

test('an unchanged bot is not flagged', async () => {
    const bots = [bot('a#x', 'ghcr.io/a:1', 'sha256:aaa')];
    const prev: RegistryState = { version: 1, checkedAt: 'before', bots: { 'a#x': { oci: 'ghcr.io/a:1', digest: 'sha256:aaa', etag: null } } };
    const result = await detectChanges(bots, prev, mapChecker(new Map()), 'now');
    assert.deepEqual(result.changed, []);
});

test('a digest change is flagged', async () => {
    const bots = [bot('a#x', 'ghcr.io/a:1', 'sha256:aaa')];
    const prev: RegistryState = { version: 1, checkedAt: 'before', bots: { 'a#x': { oci: 'ghcr.io/a:1', digest: 'sha256:aaa', etag: null } } };
    const checks = new Map<string, ManifestStatus>([['ghcr.io/a:1', { changed: true, digest: 'sha256:bbb', etag: '"e"' }]]);
    const result = await detectChanges(bots, prev, mapChecker(checks), 'now');
    assert.deepEqual(result.changed, ['a#x']);
    assert.equal(result.state.bots['a#x']!.digest, 'sha256:bbb');
});

test('inactive bots are skipped entirely', async () => {
    const bots = [bot('a#x', 'ghcr.io/a:1', 'sha256:aaa', 'inactive')];
    const result = await detectChanges(bots, null, mapChecker(new Map()), 'now');
    assert.deepEqual(result.changed, []);
    assert.equal(result.state.bots['a#x'], undefined);
});

test('a bot whose OCI ref no longer resolves is retired', async () => {
    const bots = [bot('a#x', 'ghcr.io/a:1', 'sha256:aaa')];
    const checks = new Map<string, ManifestStatus>([['ghcr.io/a:1', { changed: false, digest: null, etag: null, notFound: true }]]);
    const result = await detectChanges(bots, null, mapChecker(checks), 'now');
    assert.deepEqual(result.retired, ['a#x']);
    assert.deepEqual(result.changed, []);
    assert.equal(result.state.bots['a#x'], undefined);
});
