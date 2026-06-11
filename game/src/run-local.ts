// Local end-to-end driver: seed the gh-pages store from the built sample
// components (everything in dist/ except the attacker) and run one tournament
// tick against it. This is the offline counterpart to run-tournament.ts, which
// in production gates on the (still-stubbed) OCI manifest checker; here we use a
// map checker that treats every seeded bot as new so matches always play.
//
//   cd game
//   node --experimental-wasm-jspi src/run-local.ts
//
// Reads/writes the store at STORE_DIR (defaults to ../gh-pages). Override the
// sample directory with SAMPLES_DIR and the match budget with BUDGET.

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import type { BotRecord, RegistryIndex } from './types.ts';
import { createGardenerSeat } from './host/seat.ts';
import { manufactureId, parseName } from './validate/id.ts';
import { sha256Hex } from './validate/checks.ts';
import { initEmptyStore } from './store/bootstrap.ts';
import { cacheWasm, cacheIcon, writeIndex } from './store/write.ts';
import { loadScores } from './store/read.ts';
import { runTournament } from './run.ts';
import { mapChecker } from './scan/detect.ts';

const ROOT = new URL('../../', import.meta.url);

/** Bots we never seat in the exhibition (the standing capability-denial fixture). */
const EXCLUDE = new Set(['attacker']);

/**
 * Cache a sample's local 300x300 PNG icon (samples/<stem>/<stem>.png) into the
 * store and return its store-relative path, or null when the sample ships no
 * icon. The samples directory is resolved against the repo root.
 */
async function seedIcon(base: string, stem: string, botId: string): Promise<string | null> {
    const pngFile = fileURLToPath(new URL(`samples/${stem}/${stem}.png`, ROOT));
    let pngBytes: Uint8Array;
    try {
        pngBytes = new Uint8Array(await readFile(pngFile));
    } catch {
        return null; // sample ships no icon → glyph only
    }
    return cacheIcon(base, botId, pngBytes);
}

/** Instantiate one built component, read its real metadata, and build a record. */
async function seedBot(base: string, wasmFile: string, now: string): Promise<BotRecord> {
    const bytes = new Uint8Array(await readFile(wasmFile));
    // The OCI ref the sample is published under (build-samples.yml). It is the
    // hash input for the manufactured id, so it must match the real image ref.
    const stem = basename(wasmFile).replace(/\.wasm$/, '');
    const oci = `https://ghcr.io/pavelsavara/better-together/${stem}:latest`;

    const seat = await createGardenerSeat(bytes, { id: oci, callBudgetMs: 0 });
    try {
        const meta = seat.metadata();
        const parsed = parseName(meta.name);
        if (!parsed) throw new Error(`${stem}: metadata.name "${meta.name}" is not namespace.name`);
        const id = manufactureId(oci, meta.name);
        await cacheWasm(base, id, meta.version, bytes);
        const icon = await seedIcon(base, stem, id);
        return {
            id,
            name: meta.name,
            namespace: parsed.namespace,
            shortName: parsed.shortName,
            version: meta.version,
            author: meta.author,
            repo: meta.repo,
            lore: meta.lore,
            glyph: meta.glyph,
            icon,
            iconSource: meta.icon,
            oci,
            ociDigest: 'sha256:local',
            ociEtag: null,
            wasm: `wasm/${id}/${meta.version}.wasm`,
            wasmSha256: sha256Hex(bytes),
            submittedBy: 'local',
            approvedBy: 'local',
            issue: 0,
            validatedAt: now,
            lastDigestChangeAt: now,
            matchesSinceUpdate: 0,
            status: 'active',
        };
    } finally {
        seat.dispose();
    }
}

export async function main(): Promise<number> {
    const env = process.env;
    const base = env.STORE_DIR ?? fileURLToPath(new URL('gh-pages/', ROOT));
    const samplesDir = env.SAMPLES_DIR ?? fileURLToPath(new URL('dist/', ROOT));
    const budget = env.BUDGET ? Number(env.BUDGET) : 200;
    const callBudgetMs = env.CALL_BUDGET_MS ? Number(env.CALL_BUDGET_MS) : 0;
    const masterSeed = env.MASTER_SEED ?? `local-${new Date().toISOString()}`;
    const now = new Date().toISOString();

    const wasmFiles = (await readdir(samplesDir))
        .filter((f) => f.endsWith('.wasm'))
        .filter((f) => !EXCLUDE.has(basename(f).replace(/\.wasm$/, '')))
        .map((f) => join(samplesDir, f))
        .sort();

    if (wasmFiles.length < 3) {
        console.error(`[run-local] need >= 3 built samples in ${samplesDir}; found ${wasmFiles.length}. Build them first (scripts/build-all.sh).`);
        return 1;
    }

    console.log(`[run-local] store=${base}`);
    console.log(`[run-local] seeding ${wasmFiles.length} samples from ${samplesDir}`);
    await initEmptyStore(base, now);

    const bots: BotRecord[] = [];
    for (const wasmFile of wasmFiles) {
        const bot = await seedBot(base, wasmFile, now);
        bots.push(bot);
        console.log(`  + ${bot.glyph} ${bot.name} (${bot.id})`);
    }
    bots.sort((a, b) => a.id.localeCompare(b.id));
    const index: RegistryIndex = { version: 1, updated: now, bots };
    await writeIndex(base, index);

    console.log(`[run-local] running tournament tick (budget=${budget}, callBudgetMs=${callBudgetMs}, seed=${masterSeed})`);
    const result = await runTournament({
        base,
        // Empty map + no prior registry-state → every seeded bot is "new" → all play.
        check: mapChecker(new Map()),
        masterSeed,
        budget,
        callBudgetMs,
        scoring: { windowPerBot: 500, minMatchesToRank: 1 },
    });

    console.log(`[run-local] matches=${result.matchesRun} changed=${result.changed.length}`);
    const scores = await loadScores(base);
    if (scores) {
        console.log('[run-local] leaderboard (top 10 by Co-Player):');
        for (const row of scores.leaderboard.slice(0, 10)) {
            console.log(`  ${String(row.rank ?? '-').padStart(2)}  ${row.id}  coPlayer=${row.coPlayerScore.toFixed(3)}`);
        }
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().then((code) => process.exit(code)).catch((e) => {
        console.error(e);
        process.exit(2);
    });
}
