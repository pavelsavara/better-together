// Avatar pipeline (docs/architecture.md §3, check #7-#8).
//
// For a bot whose metadata.icon is set, the validator must: fetch it
// (size-capped, CI only), confirm it decodes as a real image, strip metadata,
// resize to a 100×100 PNG, and cache it same-origin as icons/<id>.png. The
// decode + resize uses `sharp` (loaded lazily so the wider engine/test imports
// of this module's URL helper and types don't pull in the native binding); the
// pipeline still takes an `AvatarProcessor` so it can be mocked in tests.

/** Max bytes to download for a candidate avatar before rejecting it. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

/** The cached avatar's square edge in pixels. */
export const AVATAR_EDGE = 100;

export interface AvatarResult {
    /** The re-encoded 100×100 PNG bytes to cache. */
    png: Uint8Array;
}

/** Process a source icon URL into a cached 100×100 PNG, or throw on failure. */
export type AvatarProcessor = (sourceUrl: string) => Promise<AvatarResult>;

/** Validate an icon field's shape: must be a syntactically valid https URL. */
export function isValidIconUrl(url: string): boolean {
    try {
        const u = new URL(url);
        return u.protocol === 'https:';
    } catch {
        return false;
    }
}

export interface AvatarProcessorOptions {
    /** Injectable fetch (for tests); defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
    /** Per-request timeout in milliseconds (default 10s). */
    timeoutMs?: number;
    /**
     * Injectable decode+resize step (for tests, to avoid loading `sharp`).
     * Takes the fetched image bytes and returns a 100×100 PNG. Defaults to a
     * sharp-based encoder.
     */
    resize?: (input: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Decode arbitrary image bytes (PNG/JPEG/WebP/GIF/…) and re-encode a square
 * 100×100 PNG with all source metadata stripped. `sharp` is imported lazily so
 * the native binding only loads when an avatar is actually processed. `fit:
 * 'cover'` crops to fill the square; the default PNG output carries no input
 * metadata (no `.withMetadata()`), satisfying the "strip metadata" requirement.
 */
async function sharpResize(input: Uint8Array): Promise<Uint8Array> {
    const sharp = (await import('sharp')).default;
    const out = await sharp(input)
        .resize(AVATAR_EDGE, AVATAR_EDGE, { fit: 'cover' })
        .png()
        .toBuffer();
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * The production avatar processor: fetch the https icon URL (size-capped via
 * MAX_AVATAR_BYTES, with a timeout), then decode + resize to a 100×100 PNG. Any
 * network/format failure throws, which the validator turns into a friendly
 * rejection (checks.ts check #7-#8).
 */
export function createAvatarProcessor(opts: AvatarProcessorOptions = {}): AvatarProcessor {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const resize = opts.resize ?? sharpResize;

    return async (sourceUrl: string): Promise<AvatarResult> => {
        if (!isValidIconUrl(sourceUrl)) throw new Error(`icon must be an https URL; got "${sourceUrl}"`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchImpl(sourceUrl, { signal: controller.signal, redirect: 'follow' });
            if (!res.ok) throw new Error(`GET ${sourceUrl} -> HTTP ${res.status}`);

            const declared = Number(res.headers.get('content-length') ?? '');
            if (Number.isFinite(declared) && declared > MAX_AVATAR_BYTES) {
                const mb = (declared / (1024 * 1024)).toFixed(1);
                throw new Error(`avatar is ${mb} MB, over the ${MAX_AVATAR_BYTES / (1024 * 1024)} MB limit`);
            }

            const bytes = new Uint8Array(await res.arrayBuffer());
            if (bytes.length > MAX_AVATAR_BYTES) {
                const mb = (bytes.length / (1024 * 1024)).toFixed(1);
                throw new Error(`avatar is ${mb} MB, over the ${MAX_AVATAR_BYTES / (1024 * 1024)} MB limit`);
            }

            const png = await resize(bytes);
            return { png };
        } finally {
            clearTimeout(timer);
        }
    };
}

/**
 * A processor that refuses to run. Kept for entry points that must explicitly
 * opt out of network/native I/O; production uses `createAvatarProcessor`.
 */
export const notImplementedAvatarProcessor: AvatarProcessor = async (sourceUrl) => {
    throw new Error(`avatar processing disabled for "${sourceUrl}"`);
};

/** A test processor that returns fixed PNG bytes for any URL. */
export function fixedAvatarProcessor(png: Uint8Array): AvatarProcessor {
    return async () => ({ png });
}
