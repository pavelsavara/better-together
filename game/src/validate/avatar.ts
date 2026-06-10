// Avatar pipeline (docs/architecture.md §3, check #7-#8).
//
// For a bot whose metadata.icon is set, the validator must: fetch it
// (size-capped, CI only), confirm it decodes as a real image, strip metadata,
// resize to a 100×100 PNG, and cache it same-origin as icons/<id>.png. The
// fetch + decode + resize integration (e.g. `sharp`) is intentionally STUBBED
// for now (see TODO); the pipeline takes an `AvatarProcessor` so it can be
// mocked in tests and swapped for the real implementation later.

/** Max bytes to download for a candidate avatar before rejecting it. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

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

/**
 * The production avatar processor. TODO: fetch (size-capped via MAX_AVATAR_BYTES),
 * decode (PNG/JPEG/WebP/GIF), strip metadata, and resize to a 100×100 PNG (e.g.
 * with `sharp`). Until then it throws so the dependency is explicit.
 */
export const notImplementedAvatarProcessor: AvatarProcessor = async (sourceUrl) => {
    throw new Error(`avatar processing not implemented (TODO: fetch + sharp resize) for "${sourceUrl}"`);
};

/** A test processor that returns fixed PNG bytes for any URL. */
export function fixedAvatarProcessor(png: Uint8Array): AvatarProcessor {
    return async () => ({ png });
}
