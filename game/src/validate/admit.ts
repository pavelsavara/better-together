// Admit a validated bot (docs/architecture.md §3, check #9 + admit step).
//
// Caches the component bytes + (optional) avatar, then upserts the bot into
// index.json with the manufactured id, OCI provenance (digest/ETag), and the
// sha256 pin. Only the Validation Action calls this, so it is the sole writer of
// index.json + wasm/ + icons/.

import type { BotRecord, RegistryIndex } from '../types.ts';
import { loadIndex } from '../store/read.ts';
import { writeIndex, cacheWasm, cacheIcon } from '../store/write.ts';
import { INDEX_VERSION } from '../store/schema.ts';
import type { AdmitData } from './checks.ts';

/** Build the BotRecord for an admitted bot (paths filled in by admitBot). */
function toRecord(a: AdmitData, wasmPath: string, iconPath: string | null): BotRecord {
    return {
        id: a.id,
        name: a.metadata.name,
        namespace: a.namespace,
        shortName: a.shortName,
        version: a.metadata.version,
        author: a.author || a.metadata.author || a.submittedBy,
        repo: a.metadata.repo,
        lore: a.metadata.lore,
        glyph: a.metadata.glyph,
        icon: iconPath,
        iconSource: a.iconSource,
        oci: a.oci,
        ociDigest: a.digest,
        ociEtag: a.etag,
        wasm: wasmPath,
        wasmSha256: a.wasmSha256,
        submittedBy: a.submittedBy,
        approvedBy: a.approvedBy,
        issue: a.issue,
        validatedAt: a.validatedAt,
        lastDigestChangeAt: a.validatedAt,
        matchesSinceUpdate: 0,
        status: 'active',
    };
}

/**
 * Admit a validated bot: cache its wasm (+avatar), upsert index.json, and return
 * the new record. Caches before the index write so a served wasm/icon always has
 * a backing file. The index is read fresh, the bot appended, and `updated` bumped.
 */
export async function admitBot(base: string, a: AdmitData, now = a.validatedAt): Promise<BotRecord> {
    const wasmPath = await cacheWasm(base, a.id, a.metadata.version, a.bytes);
    let iconPath: string | null = null;
    if (a.avatarPng) {
        iconPath = await cacheIcon(base, a.id, a.avatarPng);
    }

    const record = toRecord(a, wasmPath, iconPath);

    const index: RegistryIndex = await loadIndex(base);
    index.version = INDEX_VERSION;
    index.updated = now;
    // Replace any existing record with the same id (idempotent re-admit), else append.
    const at = index.bots.findIndex((b) => b.id === record.id);
    if (at >= 0) index.bots[at] = record;
    else index.bots.push(record);
    // Keep a stable order so the diff is minimal.
    index.bots.sort((x, y) => x.id.localeCompare(y.id));

    await writeIndex(base, index);
    return record;
}
