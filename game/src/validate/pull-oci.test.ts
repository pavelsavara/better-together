import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPuller, MAX_COMPONENT_BYTES } from './pull-oci.ts';

/** A minimal Response-like object for the injected fetch. */
function res(status: number, headers: Record<string, string>, body?: Uint8Array): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(headers),
        arrayBuffer: async () => (body ?? new Uint8Array()).buffer,
    } as unknown as Response;
}

test('createPuller fetches a direct https .wasm URL and reports sha256 + etag', async () => {
    const bytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 2, 3]);
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
        calls.push(String(url));
        return res(200, { etag: '"w1"', 'content-length': String(bytes.byteLength) }, bytes);
    }) as unknown as typeof fetch;

    const pull = createPuller({ fetchImpl });
    const art = await pull('https://example.com/bots/ferris.wasm');

    assert.equal(calls[0], 'https://example.com/bots/ferris.wasm');
    assert.deepEqual(art.bytes, bytes);
    assert.equal(art.etag, '"w1"');
    assert.equal(art.digest, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
});

test('createPuller rejects a non-OK download', async () => {
    const fetchImpl = (async () => res(403, {})) as unknown as typeof fetch;
    const pull = createPuller({ fetchImpl });
    await assert.rejects(() => pull('https://example.com/x.wasm'), /HTTP 403/);
});

test('createPuller rejects an over-limit Content-Length before buffering', async () => {
    const fetchImpl = (async () =>
        res(200, { 'content-length': String(MAX_COMPONENT_BYTES + 1) })) as unknown as typeof fetch;
    const pull = createPuller({ fetchImpl });
    await assert.rejects(() => pull('https://example.com/big.wasm'), /over the/);
});

// --- OCI registry path -----------------------------------------------------

const WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const sha = (b: Uint8Array) => `sha256:${createHash('sha256').update(b).digest('hex')}`;

/** A Response-like object that returns a JSON body (for manifests). */
function jsonRes(status: number, headers: Record<string, string>, json: unknown): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(headers),
        json: async () => json,
        arrayBuffer: async () => new Uint8Array().buffer,
    } as unknown as Response;
}

/** Build a router fetch over a {url → (init) → Response} table, recording calls. */
function router(routes: Record<string, (init?: RequestInit) => Response>) {
    const calls: { url: string; auth: string | null }[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        const headers = (init?.headers ?? {}) as Record<string, string>;
        calls.push({ url: u, auth: headers.Authorization ?? null });
        const handler = routes[u];
        if (!handler) throw new Error(`unexpected fetch: ${u}`);
        return handler(init);
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
}

test('createPuller pulls an OCI image manifest wasm layer and verifies the blob digest', async () => {
    const layerDigest = sha(WASM);
    const manifest = {
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        layers: [{ mediaType: 'application/wasm', digest: layerDigest, size: WASM.byteLength }],
    };
    const { fetchImpl, calls } = router({
        'https://ghcr.io/v2/jane/bram/manifests/latest': () =>
            jsonRes(200, { 'docker-content-digest': 'sha256:MANIFEST' }, manifest),
        [`https://ghcr.io/v2/jane/bram/blobs/${layerDigest}`]: () =>
            res(200, { 'content-length': String(WASM.byteLength) }, WASM),
    });

    const art = await createPuller({ fetchImpl, credentials: null })('ghcr.io/jane/bram:latest');

    assert.deepEqual(art.bytes, WASM);
    assert.equal(art.digest, 'sha256:MANIFEST');
    assert.equal(calls.length, 2);
});

test('createPuller follows an index to the wasm platform child manifest', async () => {
    const layerDigest = sha(WASM);
    const index = {
        mediaType: 'application/vnd.oci.image.index.v1+json',
        manifests: [
            { digest: 'sha256:ATTEST', annotations: { 'vnd.docker.reference.type': 'attestation-manifest' } },
            { digest: 'sha256:CHILD', platform: { architecture: 'wasm', os: 'wasi' } },
        ],
    };
    const child = { layers: [{ mediaType: 'application/wasm', digest: layerDigest, size: WASM.byteLength }] };
    const { fetchImpl } = router({
        'https://ghcr.io/v2/jane/bram/manifests/latest': () =>
            jsonRes(200, { 'docker-content-digest': 'sha256:INDEX' }, index),
        'https://ghcr.io/v2/jane/bram/manifests/sha256:CHILD': () =>
            jsonRes(200, { 'docker-content-digest': 'sha256:CHILD' }, child),
        [`https://ghcr.io/v2/jane/bram/blobs/${layerDigest}`]: () => res(200, {}, WASM),
    });

    const art = await createPuller({ fetchImpl, credentials: null })('ghcr.io/jane/bram:latest');

    assert.deepEqual(art.bytes, WASM);
    assert.equal(art.digest, 'sha256:CHILD');
});

test('createPuller performs the bearer-token handshake on 401 and retries with the token', async () => {
    const layerDigest = sha(WASM);
    const manifest = { layers: [{ mediaType: 'application/wasm', digest: layerDigest, size: WASM.byteLength }] };
    const challenge =
        'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:jane/bram:pull"';
    // Each resource 401s once (no challenge satisfied yet), then succeeds when
    // the request carries a bearer token — mirroring a real registry, where the
    // token is minted per resource.
    const gate = (ok: () => Response) => (init?: RequestInit) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
        return auth ? ok() : jsonRes(401, { 'www-authenticate': challenge }, {});
    };
    const { fetchImpl, calls } = router({
        'https://ghcr.io/v2/jane/bram/manifests/latest': gate(() =>
            jsonRes(200, { 'docker-content-digest': 'sha256:MANIFEST' }, manifest),
        ),
        'https://ghcr.io/token?service=ghcr.io&scope=repository%3Ajane%2Fbram%3Apull': () =>
            jsonRes(200, {}, { token: 'tok-123' }),
        [`https://ghcr.io/v2/jane/bram/blobs/${layerDigest}`]: gate(() => res(200, {}, WASM)),
    });

    const art = await createPuller({ fetchImpl, credentials: null })('ghcr.io/jane/bram:latest');

    assert.deepEqual(art.bytes, WASM);
    // The retried manifest GET and the retried blob GET both carry the token.
    const authed = calls.filter((c) => c.auth === 'Bearer tok-123');
    assert.equal(authed.length, 2);
});

test('createPuller rejects a blob whose sha256 does not match the manifest layer digest', async () => {
    const manifest = { layers: [{ mediaType: 'application/wasm', digest: 'sha256:deadbeef', size: WASM.byteLength }] };
    const { fetchImpl } = router({
        'https://ghcr.io/v2/jane/bram/manifests/latest': () => jsonRes(200, {}, manifest),
        'https://ghcr.io/v2/jane/bram/blobs/sha256:deadbeef': () => res(200, {}, WASM),
    });

    await assert.rejects(
        () => createPuller({ fetchImpl, credentials: null })('ghcr.io/jane/bram:latest'),
        /digest mismatch/,
    );
});

test('createPuller rejects an OCI manifest with no wasm layer', async () => {
    const manifest = { layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: 'sha256:x' }, { mediaType: 'application/json', digest: 'sha256:y' }] };
    const { fetchImpl } = router({
        'https://ghcr.io/v2/jane/bram/manifests/latest': () => jsonRes(200, {}, manifest),
    });

    await assert.rejects(
        () => createPuller({ fetchImpl, credentials: null })('ghcr.io/jane/bram:latest'),
        /no wasm layer/,
    );
});
