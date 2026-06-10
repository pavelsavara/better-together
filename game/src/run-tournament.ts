// CLI entry point for the scheduled tournament (.github/workflows/tournament.yml).
//
// Reads the store dir + master seed from the environment and runs one tick.
// NOTE: the OCI manifest checker is still STUBBED (scan/detect.ts), so the
// workflow stays disabled until it lands; this entry point wires the full flow
// so enabling it is a one-spot change.

import { fileURLToPath } from 'node:url';
import { runTournament } from './run.ts';
import { notImplementedChecker } from './scan/detect.ts';

export async function main(): Promise<number> {
    const env = process.env;
    const base = env.STORE_DIR ?? '.';
    const masterSeed = env.MASTER_SEED ?? new Date().toISOString();
    const budget = env.BUDGET ? Number(env.BUDGET) : undefined;
    const callBudgetMs = env.CALL_BUDGET_MS ? Number(env.CALL_BUDGET_MS) : undefined;

    const result = await runTournament({
        base,
        check: notImplementedChecker,
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
