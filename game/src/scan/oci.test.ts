import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOciRef, createOciManifestChecker, isWasmUrl } from './oci.ts';

test('parseOciRef: host/repo/tag with https scheme', () => {
    assert.deepEqual(parseOciRef('https://ghcr.io/pavelsavara/better-together/nib:latest'), {
        host: 'ghcr.io',
        repository: 'pavelsavara/better-together/nib',
        reference: 'latest',
    });
});

test('parseOciRef: no scheme, no tag defaults to latest', () => {
    assert.deepEqual(parseOciRef('ghcr.io/jane/bram'), {
        host: 'ghcr.io',
        repository: 'jane/bram',
        reference: 'latest',
    });
});

test('parseOciRef: @digest reference wins', () => {
    assert.deepEqual(parseOciRef('ghcr.io/jane/bram@sha256:abc'), {
        host: 'ghcr.io',
        repository: 'jane/bram',
        reference: 'sha256:abc',
    });
});

test('parseOciRef: rejects a ref without a repository', () => {
    assert.throws(() => parseOciRef('ghcr.io'));
});

/** A minimal Response-like object for the injected fetch. */
function res(status: number, headers: Record<string, string> = {}, body?: unknown): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(headers),
        json: async () => body,
    } as unknown as Response;
}

test('200 OK returns the Docker-Content-Digest and ETag', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return res(200, { 'docker-content-digest': 'sha256:aaa', etag: '"e1"' });
    }) as unknown as typeof fetch;

    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('ghcr.io/jane/bram:latest', null);
    assert.deepEqual(status, { changed: false, digest: 'sha256:aaa', etag: '"e1"' });
    assert.equal(calls[0]!.url, 'https://ghcr.io/v2/jane/bram/manifests/latest');
    assert.equal((calls[0]!.init as { method?: string }).method, 'HEAD');
});

test('304 Not Modified reports unchanged with no fresh digest/etag', async () => {
    const fetchImpl = (async () => res(304)) as unknown as typeof fetch;
    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('ghcr.io/jane/bram:latest', '"e1"');
    assert.deepEqual(status, { changed: false, digest: null, etag: null });
});

test('If-None-Match is sent when an etag is known', async () => {
    let sent: string | null = null;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        sent = new Headers(init?.headers).get('if-none-match');
        return res(304);
    }) as unknown as typeof fetch;
    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    await check('ghcr.io/jane/bram:latest', '"prev"');
    assert.equal(sent, '"prev"');
});

test('404 retires the bot', async () => {
    const fetchImpl = (async () => res(404)) as unknown as typeof fetch;
    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('ghcr.io/jane/gone:latest', null);
    assert.equal(status.notFound, true);
});

test('a 401 challenge triggers a token fetch and a retry', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        urls.push(u);
        if (u.startsWith('https://ghcr.io/v2/')) {
            const auth = new Headers(init?.headers).get('authorization');
            if (!auth) {
                return res(401, {
                    'www-authenticate':
                        'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:jane/bram:pull"',
                });
            }
            assert.equal(auth, 'Bearer TOK');
            return res(200, { 'docker-content-digest': 'sha256:bbb', etag: '"e2"' });
        }
        // token endpoint
        return res(200, {}, { token: 'TOK' });
    }) as unknown as typeof fetch;

    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('ghcr.io/jane/bram:latest', null);
    assert.deepEqual(status, { changed: false, digest: 'sha256:bbb', etag: '"e2"' });
    // unauth HEAD -> token GET -> authed HEAD
    assert.equal(urls.length, 3);
    assert.match(urls[1]!, /^https:\/\/ghcr\.io\/token\?/);
    assert.match(urls[1]!, /scope=repository%3Ajane%2Fbram%3Apull/);
});

test('a non-404 error status throws', async () => {
    const fetchImpl = (async () => res(500)) as unknown as typeof fetch;
    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    await assert.rejects(() => check('ghcr.io/jane/bram:latest', null), /HTTP 500/);
});

test('isWasmUrl: true for an https .wasm URL, false for OCI refs', () => {
    assert.equal(isWasmUrl('https://example.com/bots/ferris.wasm'), true);
    assert.equal(isWasmUrl('https://example.com/bots/ferris.WASM'), true);
    assert.equal(isWasmUrl(' https://example.com/x.wasm '), true);
    assert.equal(isWasmUrl('http://example.com/x.wasm'), false); // https only
    assert.equal(isWasmUrl('https://example.com/x.txt'), false);
    assert.equal(isWasmUrl('ghcr.io/jane/bram:latest'), false);
    assert.equal(isWasmUrl('https://ghcr.io/jane/bram:latest'), false);
});

test('a direct .wasm URL is checked with a conditional HEAD on the URL itself', async () => {
    const calls: Array<{ url: string; method?: string; ifNoneMatch: string | null }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
        calls.push({
            url: String(url),
            method: (init as { method?: string })?.method,
            ifNoneMatch: new Headers(init?.headers).get('if-none-match'),
        });
        return res(200, { etag: '"w1"' });
    }) as unknown as typeof fetch;

    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('https://example.com/bots/ferris.wasm', null);
    // A 200 to a conditional request means the content changed.
    assert.deepEqual(status, { changed: true, digest: null, etag: '"w1"' });
    assert.equal(calls[0]!.url, 'https://example.com/bots/ferris.wasm');
    assert.equal(calls[0]!.method, 'HEAD');
});

test('a direct .wasm URL 304 reports unchanged and carries the etag forward', async () => {
    let sent: string | null = null;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        sent = new Headers(init?.headers).get('if-none-match');
        return res(304);
    }) as unknown as typeof fetch;
    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('https://example.com/bots/ferris.wasm', '"w1"');
    assert.equal(sent, '"w1"');
    assert.deepEqual(status, { changed: false, digest: null, etag: '"w1"' });
});

test('a direct .wasm URL 404 retires the bot', async () => {
    const fetchImpl = (async () => res(404)) as unknown as typeof fetch;
    const check = createOciManifestChecker({ fetchImpl, credentials: null });
    const status = await check('https://example.com/bots/gone.wasm', null);
    assert.equal(status.notFound, true);
});
