import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runValidation, type ValidationDeps, type SubmissionInput } from './checks.ts';
import { admitBot } from './admit.ts';
import { bytesPuller, MAX_COMPONENT_BYTES, type OciArtifact } from './pull-oci.ts';
import { fixedAvatarProcessor } from './avatar.ts';
import { emptyRegistryIndex } from '../store/schema.ts';
import { loadIndex } from '../store/read.ts';
import { sha256Hex } from './checks.ts';

const ROOT = new URL('../../../', import.meta.url);
const SAMPLE_WASM: Record<string, string> = {
    ferris: 'samples/ferris/target/wasm32-wasip2/release/ferris.wasm',
    corro: 'samples/corro/target/wasm32-wasip1/release/corro.wasm',
    nib: 'samples/nib/nib.wasm',
    gopher: 'samples/gopher/gopher.wasm',
    attacker: 'samples/attacker/target/wasm32-wasip2/release/attacker.wasm',
};
const path = (n: string) => fileURLToPath(new URL(SAMPLE_WASM[n]!, ROOT));
const exists = (n: string) => existsSync(path(n));
const bytes = async (n: string) => new Uint8Array(await readFile(path(n)));

async function fillers(): Promise<Array<{ id: string; bytes: Uint8Array }>> {
    const names = ['corro', 'nib', 'gopher'].filter(exists);
    const out: Array<{ id: string; bytes: Uint8Array }> = [];
    for (const n of names) out.push({ id: n, bytes: await bytes(n) });
    return out;
}

function depsWith(ref: string, art: OciArtifact, fillerList: Array<{ id: string; bytes: Uint8Array }>): ValidationDeps {
    return {
        pullOci: bytesPuller(new Map([[ref, art]])),
        processAvatar: fixedAvatarProcessor(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
        fillerSamples: fillerList,
        callBudgetMs: 0,
        now: () => '2026-06-11T00:00:00Z',
    };
}

const HAVE_SAMPLES = exists('ferris') && ['corro', 'nib', 'gopher'].filter(exists).length >= 3;

const sub = (oci: string): SubmissionInput => ({
    oci,
    blurb: 'test bot',
    author: 'jane',
    submittedBy: 'jane',
    approvedBy: 'maintainer',
    issue: 1,
});

test('a benign sample validates and admits with a cached wasm + index entry', { skip: !HAVE_SAMPLES ? 'need ferris + 3 fillers' : false }, async () => {
    const base = await mkdtemp(join(tmpdir(), 'bt-validate-'));
    try {
        const b = await bytes('ferris');
        const oci = 'ghcr.io/jane/ferris:1.0.0';
        const art: OciArtifact = { bytes: b, digest: 'sha256:deadbeef', etag: '"etag1"' };
        const result = await runValidation(sub(oci), emptyRegistryIndex(), depsWith(oci, art, await fillers()));
        assert.equal(result.ok, true, result.ok ? '' : (result as { reason: string }).reason);
        if (!result.ok) return;

        assert.match(result.admit.id, /^[0-9a-f]{8}#/);
        assert.equal(result.admit.wasmSha256, sha256Hex(b));
        assert.equal(result.admit.digest, 'sha256:deadbeef');

        const record = await admitBot(base, result.admit);
        const index = await loadIndex(base);
        assert.equal(index.bots.length, 1);
        assert.equal(index.bots[0]!.id, record.id);
        assert.equal(index.bots[0]!.status, 'active');
        // The cached wasm exists at the recorded path and matches the sha.
        const cached = new Uint8Array(await readFile(join(base, record.wasm)));
        assert.equal(sha256Hex(cached), result.admit.wasmSha256);

        // 10. Re-submitting the same ref is rejected as a duplicate.
        const dup = await runValidation(sub(oci), index, depsWith(oci, art, await fillers()));
        assert.equal(dup.ok, false);
        if (!dup.ok) assert.match(dup.reason, /already registered/i);
    } finally {
        await rm(base, { recursive: true, force: true });
    }
});

test('the attacker is rejected at the smoke match (capability denial)', { skip: !HAVE_SAMPLES || !exists('attacker') ? 'need attacker + fillers' : false }, async () => {
    const oci = 'ghcr.io/evil/attacker:1.0.0';
    const art: OciArtifact = { bytes: await bytes('attacker'), digest: null, etag: null };
    const result = await runValidation(sub(oci), emptyRegistryIndex(), depsWith(oci, art, await fillers()));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /smoke match failed|sandbox/i);
});

test('an oversized component is friendly-rejected before instantiation', async () => {
    const oci = 'ghcr.io/jane/huge:1.0.0';
    const art: OciArtifact = { bytes: new Uint8Array(MAX_COMPONENT_BYTES + 1), digest: null, etag: null };
    const result = await runValidation(sub(oci), emptyRegistryIndex(), depsWith(oci, art, []));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /15 MB limit/);
});

test('an unresolvable OCI ref is rejected with a clear message', async () => {
    const deps: ValidationDeps = {
        pullOci: bytesPuller(new Map()),
        processAvatar: fixedAvatarProcessor(new Uint8Array()),
        fillerSamples: [],
        callBudgetMs: 0,
    };
    const result = await runValidation(sub('ghcr.io/nope/missing:1'), emptyRegistryIndex(), deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /Could not pull/);
});
