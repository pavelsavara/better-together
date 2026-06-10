// OCI pull → wasm bytes (docs/architecture.md §3, check #1-#2).
//
// The real puller shells out to `oras`/`wkg` to resolve the ref, download the
// single wasm artifact, and report the manifest digest + ETag for later change
// detection. That binary integration is intentionally STUBBED for now (see
// TODO); the validation pipeline takes an `OciPuller` so it can be driven with
// local bytes in tests and swapped for the real implementation later.

export const MAX_COMPONENT_BYTES = 15 * 1024 * 1024; // 15 MB (check #2)

export interface OciArtifact {
    bytes: Uint8Array;
    /** Manifest digest, e.g. "sha256:9f86d08…" (for change detection). */
    digest: string | null;
    /** Manifest ETag for conditional GETs, or null. */
    etag: string | null;
}

export type OciPuller = (ref: string) => Promise<OciArtifact>;

/**
 * The production puller. TODO: implement via `oras pull` / `wkg oci pull`,
 * extracting the single wasm layer and capturing the manifest digest + ETag.
 * Until then it throws so the dependency is explicit and never silently no-ops.
 */
export const notImplementedPuller: OciPuller = async (ref) => {
    throw new Error(`OCI pull not implemented (TODO: oras/wkg) for ref "${ref}"`);
};

/** A test/offline puller backed by an in-memory ref → artifact map. */
export function bytesPuller(map: Map<string, OciArtifact>): OciPuller {
    return async (ref: string) => {
        const art = map.get(ref);
        if (!art) throw new Error(`OCI ref not resolvable: ${ref}`);
        return art;
    };
}
