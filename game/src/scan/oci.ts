// Production OCI manifest checker (docs/architecture.md §2.4, §4.1).
//
// Implements the `ManifestChecker` injected into the scheduled tournament: a
// cheap conditional manifest request per active bot against an OCI registry
// (GHCR in production). It is a thin client of the OCI Distribution Spec:
//
//   HEAD /v2/<repository>/manifests/<reference>
//     Accept: <manifest + index media types>
//     If-None-Match: "<etag>"        (when we have one from a prior tick)
//
//   200 OK            -> read Docker-Content-Digest + ETag; detect.ts compares
//                        the digest to the last-seen one to decide "changed".
//   304 Not Modified  -> unchanged (no digest/etag in the body; carry forward).
//   404 / 401-no-repo -> the ref no longer resolves -> the bot is retired.
//
// Registries gate even public pulls behind a bearer token, so a 401 carrying a
// `WWW-Authenticate: Bearer …` challenge triggers an anonymous token fetch and
// a single retry. Network/parse errors propagate so a tick fails loudly rather
// than silently skipping a changed bot.

import type { ManifestChecker, ManifestStatus } from './detect.ts';

/** The manifest + index media types we accept (OCI first, then Docker v2). */
export const ACCEPT_MANIFESTS = [
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
].join(', ');

export interface ParsedRef {
    /** Registry host (e.g. "ghcr.io"). */
    host: string;
    /** Repository path (e.g. "pavelsavara/better-together/nib"). */
    repository: string;
    /** Tag or digest reference (defaults to "latest"). */
    reference: string;
}

/**
 * True when `ref` is a direct https URL to a `.wasm` component rather than an
 * OCI registry reference. Such refs are fetched as plain HTTP downloads (see
 * validate/pull-oci.ts) and change-detected by a conditional HEAD on the URL
 * itself instead of the OCI manifest protocol.
 */
export function isWasmUrl(ref: string): boolean {
    let u: URL;
    try {
        u = new URL(ref.trim());
    } catch {
        return false;
    }
    return u.protocol === 'https:' && u.pathname.toLowerCase().endsWith('.wasm');
}

/**
 * Parse an OCI image reference into host / repository / reference. Tolerates a
 * leading `https://` (or `http://`) scheme, which the store records on each
 * bot's `oci` field. A `@sha256:…` digest reference takes precedence over a
 * `:tag`; with neither, the reference defaults to `latest`.
 */
export function parseOciRef(oci: string): ParsedRef {
    let s = oci.trim().replace(/^https?:\/\//i, '');
    if (s.endsWith('/')) s = s.slice(0, -1);
    const firstSlash = s.indexOf('/');
    if (firstSlash < 0) throw new Error(`invalid OCI ref (no repository): "${oci}"`);
    const host = s.slice(0, firstSlash);
    let path = s.slice(firstSlash + 1);
    if (!host || !path) throw new Error(`invalid OCI ref: "${oci}"`);

    // A `@digest` reference wins over a `:tag` if both are present.
    const at = path.indexOf('@');
    if (at >= 0) {
        const reference = path.slice(at + 1);
        const repository = path.slice(0, at);
        if (!repository || !reference) throw new Error(`invalid OCI ref: "${oci}"`);
        return { host, repository, reference };
    }
    // A tag is the last ':' that follows the last path segment separator.
    const lastColon = path.lastIndexOf(':');
    if (lastColon > path.lastIndexOf('/')) {
        const reference = path.slice(lastColon + 1);
        const repository = path.slice(0, lastColon);
        if (!repository || !reference) throw new Error(`invalid OCI ref: "${oci}"`);
        return { host, repository, reference };
    }
    return { host, repository: path, reference: 'latest' };
}

/** Parse a `WWW-Authenticate: Bearer key="value", …` challenge into a map. */
function parseBearerChallenge(header: string): Record<string, string> | null {
    const m = /^\s*Bearer\s+(.*)$/i.exec(header);
    if (!m) return null;
    const out: Record<string, string> = {};
    for (const pair of m[1]!.matchAll(/([a-zA-Z0-9_]+)="([^"]*)"/g)) {
        out[pair[1]!] = pair[2]!;
    }
    return out;
}

export interface OciCheckerOptions {
    /** Injectable fetch (for tests); defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
    /**
     * Optional credentials for the token endpoint (e.g. a GHCR PAT for higher
     * rate limits or private images). Public images need none. When omitted,
     * `GHCR_TOKEN`/`GITHUB_TOKEN` from the environment is used if present.
     */
    credentials?: { username: string; password: string } | null;
    /** Per-request timeout in milliseconds (default 10s). */
    timeoutMs?: number;
}

/** Fetch an anonymous (or credentialed) bearer token for a registry challenge. */
async function fetchToken(
    fetchImpl: typeof fetch,
    challenge: Record<string, string>,
    credentials: { username: string; password: string } | null,
    signal: AbortSignal,
): Promise<string | null> {
    const realm = challenge.realm;
    if (!realm) return null;
    const url = new URL(realm);
    if (challenge.service) url.searchParams.set('service', challenge.service);
    if (challenge.scope) url.searchParams.set('scope', challenge.scope);

    const headers: Record<string, string> = {};
    if (credentials) {
        const basic = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        headers.Authorization = `Basic ${basic}`;
    }
    const res = await fetchImpl(url, { headers, signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string; access_token?: string };
    return body.token ?? body.access_token ?? null;
}

/** Registry credentials, or null for anonymous pulls. */
export type RegistryCredentials = { username: string; password: string } | null;

/**
 * Resolve registry credentials: an explicit option wins; otherwise fall back to
 * `GHCR_TOKEN`/`GITHUB_TOKEN` from the environment (as a bearer-style token).
 * Pass `null` explicitly to force anonymous.
 */
export function resolveRegistryCredentials(
    explicit: RegistryCredentials | undefined,
): RegistryCredentials {
    if (explicit !== undefined) return explicit;
    const envToken = process.env.GHCR_TOKEN || process.env.GITHUB_TOKEN;
    return envToken ? { username: 'token', password: envToken } : null;
}

/** Everything `registryFetch` needs to talk to a registry with auth. */
export interface RegistryAuth {
    fetchImpl: typeof fetch;
    credentials: RegistryCredentials;
    signal: AbortSignal;
}

/**
 * Issue a request to a registry, transparently performing the bearer-token
 * handshake on a 401 and retrying once with the minted token. Always follows
 * redirects (registries hand blob GETs off to a CDN). Returns the final
 * response, or `null` when a 401 challenge cannot be satisfied (no challenge /
 * no token) so callers can map that to not-found / unauthorized.
 */
export async function registryFetch(
    auth: RegistryAuth,
    url: string | URL,
    init: RequestInit = {},
): Promise<Response | null> {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    let res = await auth.fetchImpl(url, { ...init, headers, signal: auth.signal, redirect: 'follow' });
    if (res.status === 401) {
        const challenge = parseBearerChallenge(res.headers.get('www-authenticate') ?? '');
        if (!challenge) return null;
        const token = await fetchToken(auth.fetchImpl, challenge, auth.credentials, auth.signal);
        if (!token) return null;
        res = await auth.fetchImpl(url, {
            ...init,
            headers: { ...headers, Authorization: `Bearer ${token}` },
            signal: auth.signal,
            redirect: 'follow',
        });
    }
    return res;
}

/**
 * Create the production manifest checker. The returned function issues one
 * conditional HEAD per call, transparently performing the registry's bearer
 * token handshake on a 401 and retrying once.
 */
export function createOciManifestChecker(opts: OciCheckerOptions = {}): ManifestChecker {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const credentials = resolveRegistryCredentials(opts.credentials);

    return async (oci: string, etag: string | null): Promise<ManifestStatus> => {
        if (isWasmUrl(oci)) return checkWasmUrl(fetchImpl, oci, etag, timeoutMs);
        const { host, repository, reference } = parseOciRef(oci);
        const manifestUrl = `https://${host}/v2/${repository}/manifests/${reference}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const headers: Record<string, string> = { Accept: ACCEPT_MANIFESTS };
            if (etag) headers['If-None-Match'] = etag;

            // One conditional HEAD, with the bearer-token handshake handled by
            // registryFetch (a 401 → mint token → retry once).
            const res = await registryFetch(
                { fetchImpl, credentials, signal: controller.signal },
                manifestUrl,
                { method: 'HEAD', headers },
            );
            if (!res) return notFound();

            if (res.status === 304) {
                // Unchanged: no fresh digest/etag — detect.ts carries the prior
                // values forward (`status.digest ?? known.digest`, same for etag).
                return { changed: false, digest: null, etag: null };
            }
            if (res.status === 404) return notFound();
            if (!res.ok) {
                throw new Error(`OCI manifest HEAD ${manifestUrl} -> HTTP ${res.status}`);
            }

            // 200 OK — the digest is authoritative; detect.ts compares it to the
            // last-seen digest to decide whether the bot changed.
            const digest = res.headers.get('docker-content-digest');
            const freshEtag = res.headers.get('etag');
            return { changed: false, digest: digest ?? null, etag: freshEtag ?? etag };
        } finally {
            clearTimeout(timer);
        }
    };
}

function notFound(): ManifestStatus {
    return { changed: false, digest: null, etag: null, notFound: true };
}

/**
 * Conditional HEAD for a direct `.wasm` URL. Change detection rides on the
 * response ETag: a 304 means unchanged, a 200 (the conditional request was not
 * satisfied) means the content changed — or the server sends no ETag, in which
 * case we conservatively treat every check as changed. A 404 retires the bot.
 */
async function checkWasmUrl(
    fetchImpl: typeof fetch,
    url: string,
    etag: string | null,
    timeoutMs: number,
): Promise<ManifestStatus> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const headers: Record<string, string> = {};
        if (etag) headers['If-None-Match'] = etag;
        const res = await fetchImpl(url, { method: 'HEAD', headers, signal: controller.signal, redirect: 'follow' });
        if (res.status === 304) return { changed: false, digest: null, etag };
        if (res.status === 404) return notFound();
        if (!res.ok) throw new Error(`wasm HEAD ${url} -> HTTP ${res.status}`);
        // 200: the conditional request was not satisfied → the content changed.
        return { changed: true, digest: null, etag: res.headers.get('etag') ?? null };
    } finally {
        clearTimeout(timer);
    }
}