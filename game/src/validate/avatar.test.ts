import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
    AVATAR_EDGE,
    createAvatarProcessor,
    isValidIconUrl,
    MAX_AVATAR_BYTES,
} from './avatar.ts';

/** A minimal Response-like object for the injected fetch. */
function res(status: number, headers: Record<string, string>, body?: Uint8Array): Response {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers(headers),
        arrayBuffer: async () => (body ?? new Uint8Array()).buffer,
    } as unknown as Response;
}

test('isValidIconUrl accepts https and rejects everything else', () => {
    assert.equal(isValidIconUrl('https://example.com/a.png'), true);
    assert.equal(isValidIconUrl('http://example.com/a.png'), false);
    assert.equal(isValidIconUrl('ftp://example.com/a.png'), false);
    assert.equal(isValidIconUrl('not a url'), false);
});

test('createAvatarProcessor fetches, decodes, and resizes to a 100×100 PNG', async () => {
    // A real 40×60 JPEG source, fetched then re-encoded to a square PNG.
    const source = await sharp({ create: { width: 40, height: 60, channels: 3, background: { r: 10, g: 20, b: 30 } } })
        .jpeg()
        .toBuffer();
    const fetchImpl = (async () =>
        res(200, { 'content-length': String(source.byteLength) }, new Uint8Array(source))) as unknown as typeof fetch;

    const process = createAvatarProcessor({ fetchImpl });
    const { png } = await process('https://example.com/avatar.jpg');

    const meta = await sharp(Buffer.from(png)).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, AVATAR_EDGE);
    assert.equal(meta.height, AVATAR_EDGE);
});

test('createAvatarProcessor rejects a non-https URL before fetching', async () => {
    let fetched = false;
    const fetchImpl = (async () => {
        fetched = true;
        return res(200, {});
    }) as unknown as typeof fetch;
    await assert.rejects(() => createAvatarProcessor({ fetchImpl })('http://example.com/a.png'), /https URL/);
    assert.equal(fetched, false);
});

test('createAvatarProcessor rejects a non-OK download', async () => {
    const fetchImpl = (async () => res(404, {})) as unknown as typeof fetch;
    await assert.rejects(() => createAvatarProcessor({ fetchImpl })('https://example.com/a.png'), /HTTP 404/);
});

test('createAvatarProcessor rejects an over-limit Content-Length before buffering', async () => {
    const fetchImpl = (async () =>
        res(200, { 'content-length': String(MAX_AVATAR_BYTES + 1) })) as unknown as typeof fetch;
    await assert.rejects(() => createAvatarProcessor({ fetchImpl })('https://example.com/big.png'), /over the/);
});

test('createAvatarProcessor rejects bytes that do not decode as an image', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const fetchImpl = (async () => res(200, {}, garbage)) as unknown as typeof fetch;
    // The default sharp resizer throws on undecodable input.
    await assert.rejects(() => createAvatarProcessor({ fetchImpl })('https://example.com/notimage.png'));
});

test('createAvatarProcessor uses an injected resizer when provided (no sharp)', async () => {
    const stub = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // "‰PNG"
    const fetchImpl = (async () => res(200, {}, new Uint8Array([9, 9, 9]))) as unknown as typeof fetch;
    const process = createAvatarProcessor({ fetchImpl, resize: async () => stub });
    const { png } = await process('https://example.com/a.png');
    assert.deepEqual(png, stub);
});
