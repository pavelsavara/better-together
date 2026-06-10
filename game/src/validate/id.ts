// Manufacture the in-game id and parse the namespace.name form (architecture
// §2.1, engine-rules §6 + §Validation).
//
//   id = fnv1a32_hex(oci_ref) + "#" + metadata.name   e.g. "1a2b3c4d#together.ferris"
//
// Hashing the OCI ref pins identity to the exact image: a re-publish to a
// DIFFERENT ref is a different bot; the human-readable namespace.Name suffix
// keeps the id legible in logs, paths, and the UI.

/** Namespace must start lowercase and contain only [a-z0-9-] thereafter. */
export const NAMESPACE_RE = /^[a-z][a-z0-9-]*$/;

/** 32-bit FNV-1a of the UTF-8 bytes, as lower-case zero-padded 8-char hex. */
export function fnv1a32Hex(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let h = 0x811c9dc5;
    for (const b of bytes) {
        h ^= b;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/** Manufacture the in-game id from an OCI ref and a metadata name. */
export function manufactureId(oci: string, name: string): string {
    return `${fnv1a32Hex(oci)}#${name}`;
}

export interface ParsedName {
    /** Publisher namespace (validated against NAMESPACE_RE). */
    namespace: string;
    /** The segment after the dot (non-empty). */
    shortName: string;
}

/**
 * Split and validate a `namespace.name`. Requires exactly one '.', a namespace
 * matching NAMESPACE_RE, and a non-empty name segment. Returns null if invalid.
 */
export function parseName(name: string): ParsedName | null {
    if (typeof name !== 'string') return null;
    const dot = name.indexOf('.');
    if (dot < 0 || name.indexOf('.', dot + 1) !== -1) return null; // need exactly one dot
    const namespace = name.slice(0, dot);
    const shortName = name.slice(dot + 1);
    if (!NAMESPACE_RE.test(namespace)) return null;
    if (shortName.length === 0) return null;
    return { namespace, shortName };
}

/** Count Unicode code points (so a single emoji glyph counts as one). */
export function graphemeCount(s: string): number {
    return [...s].length;
}
