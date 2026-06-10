import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vfsByteSize, cloneVfs, enforceVfsQuota, VFS_BYTE_CAP, type Vfs } from './vfs.ts';

test('vfsByteSize counts UTF-8 string and byte values', () => {
    const fs: Vfs = new Map();
    fs.set('a.txt', 'hello'); // 5 bytes
    fs.set('b.bin', new Uint8Array([1, 2, 3])); // 3 bytes
    fs.set('utf.txt', '€'); // 3 bytes UTF-8
    assert.equal(vfsByteSize(fs), 11);
});

test('cloneVfs copies values without aliasing', () => {
    const fs: Vfs = new Map();
    const bytes = new Uint8Array([9, 9, 9]);
    fs.set('x', bytes);
    const clone = cloneVfs(fs);
    (clone.get('x') as Uint8Array)[0] = 0;
    assert.equal((fs.get('x') as Uint8Array)[0], 9, 'original must be untouched');
});

test('enforceVfsQuota passes a within-budget VFS through unchanged', () => {
    const fs: Vfs = new Map([['ok', new Uint8Array(1024)]]);
    const { fs: out, overflowed } = enforceVfsQuota(fs);
    assert.equal(overflowed, false);
    assert.equal(out, fs);
});

test('enforceVfsQuota ERASES an over-budget VFS (does not truncate)', () => {
    const fs: Vfs = new Map([['big', new Uint8Array(VFS_BYTE_CAP + 1)]]);
    const { fs: out, overflowed } = enforceVfsQuota(fs);
    assert.equal(overflowed, true);
    assert.equal(out.size, 0);
});
