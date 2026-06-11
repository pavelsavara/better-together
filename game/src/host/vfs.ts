// Per-seat virtual filesystem helpers (docs/architecture.md §2.5, §6).
//
// A gardener's only persistence channel is a private VFS mounted as its
// wasi:filesystem preopen. The host loads it from a Map before a match and
// writes any changes back afterwards. The VFS is capped at 256 KB; if a bot
// writes more, the engine ERASES the bot's VFS (it starts fresh next match)
// rather than truncating — a bot that overruns its memory budget loses it.

/** A virtual filesystem: path -> bytes (or string, which is counted as UTF-8). */
export type Vfs = Map<string, Uint8Array | string>;

/** The hard VFS size cap, in bytes (256 KB). */
export const VFS_BYTE_CAP = 256 * 1024;

const encoder = new TextEncoder();

/** Byte length of a single VFS value (UTF-8 for strings). */
function valueBytes(value: Uint8Array | string): number {
    return typeof value === 'string' ? encoder.encode(value).length : value.byteLength;
}

/** Total byte size of a VFS (sum of all values). */
export function vfsByteSize(fs: Vfs): number {
    let total = 0;
    for (const v of fs.values()) total += valueBytes(v);
    return total;
}

/** A deep-ish clone of a VFS (values are copied so the original is untouched). */
export function cloneVfs(fs: Vfs): Vfs {
    const out: Vfs = new Map();
    for (const [k, v] of fs) {
        out.set(k, typeof v === 'string' ? v : v.slice());
    }
    return out;
}

/**
 * Sanitize a (bot-controlled) VFS key into a safe relative POSIX path, or return
 * null if it is unsafe. Rejects absolute paths and any '', '.', or '..' segment
 * so a malicious key like '../../etc/passwd' can never escape vfs/<id>/ when the
 * VFS is persisted (defense-in-depth on top of the jsco preopen sandbox).
 */
export function sanitizeVfsKey(key: string): string | null {
    if (typeof key !== 'string' || key.length === 0) return null;
    const norm = key.replace(/\\/g, '/');
    if (norm.startsWith('/')) return null; // absolute
    const parts = norm.split('/');
    for (const p of parts) {
        if (p === '' || p === '.' || p === '..') return null;
    }
    return parts.join('/');
}

/**
 * Enforce the VFS byte quota AFTER a match. If the written VFS exceeds the cap,
 * the bot's VFS is ERASED (an empty Map is returned) rather than truncated.
 * Returns the VFS to persist plus whether it overflowed.
 */
export function enforceVfsQuota(fs: Vfs, cap = VFS_BYTE_CAP): { fs: Vfs; overflowed: boolean } {
    const size = vfsByteSize(fs);
    if (size > cap) {
        return { fs: new Map(), overflowed: true };
    }
    return { fs, overflowed: false };
}
