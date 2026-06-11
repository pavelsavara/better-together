// OCI pull → wasm bytes (docs/architecture.md §3, check #1-#2).
//
// A submission's component can be provided two ways:
//   • a direct https `.wasm` URL  → fetched as a plain HTTP download
//   • an OCI registry reference   → resolved over the OCI Distribution Spec
//
// Both are now supported. The OCI path is a thin client of the same registry
// protocol the manifest checker uses (scan/oci.ts): it reuses `parseOciRef`,
// `registryFetch` (bearer-token handshake + retry), `resolveRegistryCredentials`
// and the `ACCEPT_MANIFESTS` media types, then walks
//
//   GET /v2/<repo>/manifests/<ref>     (an image manifest, or an index)
//     └─ if an index: pick the wasm platform entry, GET that child manifest
//   GET /v2/<repo>/blobs/<wasm-layer-digest>
//
// returning the wasm layer bytes, the manifest digest (matching the checker's
// `Docker-Content-Digest`), and verifying the blob's sha256 against the layer
// digest. The validation pipeline takes an `OciPuller` so it can be driven with
// local bytes in tests and swapped for a different transport later.

import { createHash } from 'node:crypto';
import {
    ACCEPT_MANIFESTS,
    isWasmUrl,
    parseOciRef,
    registryFetch,
    resolveRegistryCredentials,
    type RegistryAuth,
    type RegistryCredentials,
} from '../scan/oci.ts';

export const MAX_COMPONENT_BYTES = 15 * 1024 * 1024; // 15 MB (check #2)

export interface OciArtifact {
    bytes: Uint8Array;
    /** Manifest digest, e.g. "sha256:9f86d08…" (for change detection). */
    digest: string | null;
    /** Manifest ETag for conditional GETs, or null. */
    etag: string | null;
}

export type OciPuller = (ref: string) => Promise<OciArtifact>;

export interface PullerOptions {
    /** Injectable fetch (for tests); defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
    /** Per-request timeout in milliseconds (default 30s). */
    timeoutMs?: number;
    /**
     * Registry credentials for the token endpoint. Public images need none;
     * when omitted, `GHCR_TOKEN`/`GITHUB_TOKEN` from the environment is used.
     * Pass `null` to force anonymous.
     */
    credentials?: RegistryCredentials;
}

/** Minimal shape of an OCI image manifest / index we read. */
interface Descriptor {
    mediaType?: string;
    digest: string;
    size?: number;
    platform?: { architecture?: string; os?: string };
    annotations?: Record<string, string>;
}
interface ImageManifest {
    mediaType?: string;
    config?: Descriptor;
    layers?: Descriptor[];
    manifests?: Descriptor[];
}

const sha256Hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The production puller. A direct https `.wasm` URL is downloaded as-is; an OCI
 * registry reference is resolved over the Distribution Spec (see file header).
 * Both report the content/manifest digest and are size-capped at
 * `MAX_COMPONENT_BYTES` (Content-Length first, then the actual bytes).
 */
export function createPuller(opts: PullerOptions = {}): OciPuller {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const credentials = resolveRegistryCredentials(opts.credentials);

    return async (ref: string): Promise<OciArtifact> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            if (isWasmUrl(ref)) return await fetchWasmUrl(fetchImpl, ref, controller.signal);
            const { host, repository, reference } = parseOciRef(ref);
            return await pullOci({ fetchImpl, credentials, signal: controller.signal }, host, repository, reference);
        } finally {
            clearTimeout(timer);
        }
    };
}

/** Download a direct `.wasm` URL, reporting its sha256 as the digest. */
async function fetchWasmUrl(fetchImpl: typeof fetch, url: string, signal: AbortSignal): Promise<OciArtifact> {
    const res = await fetchImpl(url, { signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    enforceDeclaredSize(res, url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    enforceActualSize(bytes, url);
    return { bytes, digest: `sha256:${sha256Hex(bytes)}`, etag: res.headers.get('etag') ?? null };
}

/** Resolve an OCI ref to its single wasm layer's bytes. */
async function pullOci(
    auth: RegistryAuth,
    host: string,
    repository: string,
    reference: string,
): Promise<OciArtifact> {
    const base = `https://${host}/v2/${repository}`;

    let { manifest, digest: manifestDigest } = await getManifest(auth, base, reference);

    // An index/manifest-list points at per-platform child manifests; descend
    // into the wasm one (skipping Docker attestation entries).
    if (manifest.manifests && manifest.manifests.length > 0) {
        const child = pickWasmPlatform(manifest.manifests);
        if (!child) throw new Error(`OCI index for ${repository}:${reference} has no wasm manifest`);
        const resolved = await getManifest(auth, base, child.digest);
        manifest = resolved.manifest;
        manifestDigest = resolved.digest ?? child.digest;
    }

    const layer = pickWasmLayer(manifest.layers ?? []);
    if (!layer) throw new Error(`OCI manifest for ${repository}:${reference} has no wasm layer`);
    if (typeof layer.size === 'number' && layer.size > MAX_COMPONENT_BYTES) {
        const mb = (layer.size / (1024 * 1024)).toFixed(1);
        throw new Error(`component is ${mb} MB, over the ${MAX_COMPONENT_BYTES / (1024 * 1024)} MB limit`);
    }

    const bytes = await getBlob(auth, base, layer.digest);
    enforceActualSize(bytes, `${repository}:${reference}`);

    // Registry integrity: the blob must hash to the digest the manifest claimed.
    const actual = `sha256:${sha256Hex(bytes)}`;
    if (layer.digest && layer.digest !== actual) {
        throw new Error(`blob digest mismatch for ${repository}:${reference}: manifest ${layer.digest} != ${actual}`);
    }

    // Report the manifest digest so it lines up with the checker's HEAD result.
    return { bytes, digest: manifestDigest ?? actual, etag: null };
}

/** GET an image manifest or index, returning the parsed body + content digest. */
async function getManifest(
    auth: RegistryAuth,
    base: string,
    reference: string,
): Promise<{ manifest: ImageManifest; digest: string | null }> {
    const res = await registryFetch(auth, `${base}/manifests/${reference}`, {
        headers: { Accept: ACCEPT_MANIFESTS },
    });
    if (!res) throw new Error(`unauthorized fetching manifest ${reference}`);
    if (!res.ok) throw new Error(`GET manifest ${reference} -> HTTP ${res.status}`);
    const manifest = (await res.json()) as ImageManifest;
    return { manifest, digest: res.headers.get('docker-content-digest') };
}

/** GET a blob by digest, enforcing the size cap via Content-Length first. */
async function getBlob(auth: RegistryAuth, base: string, digest: string): Promise<Uint8Array> {
    const res = await registryFetch(auth, `${base}/blobs/${digest}`);
    if (!res) throw new Error(`unauthorized fetching blob ${digest}`);
    if (!res.ok) throw new Error(`GET blob ${digest} -> HTTP ${res.status}`);
    enforceDeclaredSize(res, digest);
    return new Uint8Array(await res.arrayBuffer());
}

/**
 * Pick the wasm child of an index: prefer an entry whose platform architecture
 * is `wasm`, skipping Docker attestation manifests; otherwise fall back to the
 * sole non-attestation entry.
 */
function pickWasmPlatform(manifests: Descriptor[]): Descriptor | null {
    const real = manifests.filter((m) => !m.annotations?.['vnd.docker.reference.type']);
    const wasm = real.find((m) => m.platform?.architecture === 'wasm');
    if (wasm) return wasm;
    if (real.length === 1) return real[0]!;
    return real[0] ?? manifests[0] ?? null;
}

/**
 * Pick the wasm layer of a manifest: prefer a layer whose media type mentions
 * `wasm`; otherwise, if there is exactly one layer, use it.
 */
function pickWasmLayer(layers: Descriptor[]): Descriptor | null {
    const wasm = layers.find((l) => (l.mediaType ?? '').toLowerCase().includes('wasm'));
    if (wasm) return wasm;
    if (layers.length === 1) return layers[0]!;
    return null;
}

/** Reject before buffering when the server declares an over-limit size. */
function enforceDeclaredSize(res: Response, what: string): void {
    const declared = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > MAX_COMPONENT_BYTES) {
        const mb = (declared / (1024 * 1024)).toFixed(1);
        throw new Error(`component ${what} is ${mb} MB, over the ${MAX_COMPONENT_BYTES / (1024 * 1024)} MB limit`);
    }
}

/** Reject after buffering when the actual bytes exceed the limit. */
function enforceActualSize(bytes: Uint8Array, what: string): void {
    if (bytes.length > MAX_COMPONENT_BYTES) {
        const mb = (bytes.length / (1024 * 1024)).toFixed(1);
        throw new Error(`component ${what} is ${mb} MB, over the ${MAX_COMPONENT_BYTES / (1024 * 1024)} MB limit`);
    }
}

/**
 * A puller that refuses to run. Kept for tests and for entry points that must
 * explicitly opt out of network I/O; production uses `createPuller`.
 */
export const notImplementedPuller: OciPuller = async (ref) => {
    throw new Error(`OCI pull disabled for ref "${ref}"`);
};

/** A test/offline puller backed by an in-memory ref → artifact map. */
export function bytesPuller(map: Map<string, OciArtifact>): OciPuller {
    return async (ref: string) => {
        const art = map.get(ref);
        if (!art) throw new Error(`OCI ref not resolvable: ${ref}`);
        return art;
    };
}
