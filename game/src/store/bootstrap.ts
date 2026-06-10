// Bootstrap an empty gh-pages store (docs/implementation-plan.md Phase 2).
//
// Creates data/index.json, data/registry-state.json and data/meta.json in their
// empty form so a fresh tournament reads cleanly. scores.json is intentionally
// left absent until the first tournament run computes it. Seeding the bundled
// samples is wired in at admission time (Phase 3), where the in-game id is
// manufactured from each bot's OCI ref.
//
// Run directly to initialize a store dir:
//   node --experimental-strip-types src/store/bootstrap.ts <dir>

import { writeIndex, writeRegistryState, writeMeta } from './write.ts';
import { emptyRegistryIndex, emptyRegistryState, emptyMeta } from './schema.ts';

/** Write the empty data files for a fresh store at `base`. */
export async function initEmptyStore(base: string, now = new Date().toISOString()): Promise<void> {
    await writeIndex(base, emptyRegistryIndex(now));
    await writeRegistryState(base, emptyRegistryState(now));
    await writeMeta(base, emptyMeta(now));
}

// CLI entry point.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bootstrap.ts')) {
    const dir = process.argv[2];
    if (!dir) {
        console.error('usage: bootstrap.ts <store-dir>');
        process.exit(1);
    }
    await initEmptyStore(dir);
    console.log(`initialized empty store at ${dir}`);
}
