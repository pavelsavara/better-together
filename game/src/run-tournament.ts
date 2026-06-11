// CLI entry point for the scheduled tournament (.github/workflows/tournament.yml).
//
// Reads the store dir + master seed from the environment and runs one tick,
// checking each active bot's OCI manifest against the registry to gate the run.

import { fileURLToPath } from 'node:url';
import { runTournament } from './run.ts';
import { createOciManifestChecker } from './scan/oci.ts';

export async function main(): Promise<number> {
    const env = process.env;
    // Defaults to the gh-pages worktree checked out alongside the repo root
    // (see docs/runbook.md §1). CI overrides STORE_DIR explicitly.
    const base = env.STORE_DIR ?? '../gh-pages';
    const masterSeed = env.MASTER_SEED ?? new Date().toISOString();
    const budget = env.BUDGET ? Number(env.BUDGET) : undefined;
    const callBudgetMs = env.CALL_BUDGET_MS ? Number(env.CALL_BUDGET_MS) : undefined;

    const result = await runTournament({
        base,
        // Conditional manifest check per active bot. Credentials are picked up
        // from GHCR_TOKEN/GITHUB_TOKEN in the environment when present.
        check: createOciManifestChecker(),
        masterSeed,
        ...(budget !== undefined ? { budget } : {}),
        ...(callBudgetMs !== undefined ? { callBudgetMs } : {}),
    });

    if (result.skipped) {
        console.log('[tournament] no bot changed — nothing to do');
    } else {
        console.log(`[tournament] changed=${result.changed.length} matches=${result.matchesRun}`);
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().then((code) => process.exit(code)).catch((e) => {
        console.error(e);
        process.exit(2);
    });
}
