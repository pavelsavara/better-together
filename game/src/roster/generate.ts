// Roster generation for a scheduled run (docs/architecture.md §4.3).
//
// A run happens because one or more bots changed. Each generated match draws
// K∈{4,5,6}, seats a changed bot (round-robin across the changed set), and fills
// the remaining seats from the active pool weighted toward bots with the FEWEST
// windowed matches (so under-sampled bots get games). A diversity guard avoids
// re-running an identical composition back-to-back. Pure + seeded.

import { Rng } from '../core/rng.ts';

export interface PoolBot {
    id: string;
    /** Matches in this bot's trailing window (drives the under-sampling weight). */
    matchesInWindow: number;
}

export interface RosterOptions {
    /** The bot ids that changed and must be seated. */
    changed: readonly string[];
    /** Every active bot eligible to be seated (should include the changed ones). */
    pool: readonly PoolBot[];
    /** Number of matches to generate (~500, tunable). */
    budget: number;
    seed: string;
    /** How many recent compositions to remember for the diversity guard. */
    diversityMemory?: number;
}

/** A generated match roster: the bot ids seated, in draw order. */
export type Roster = string[];

/** Weighted pick (without replacement) favoring fewer windowed matches. */
function weightedPick(candidates: PoolBot[], rng: Rng): PoolBot {
    // weight = 1 / (matchesInWindow + 1): fewer matches → higher weight.
    let total = 0;
    const weights = candidates.map((c) => {
        const w = 1 / (c.matchesInWindow + 1);
        total += w;
        return w;
    });
    let r = rng.float() * total;
    for (let i = 0; i < candidates.length; i++) {
        r -= weights[i]!;
        if (r <= 0) return candidates[i]!;
    }
    return candidates[candidates.length - 1]!;
}

function compositionKey(roster: readonly string[]): string {
    return [...roster].sort().join('|');
}

/**
 * Generate `budget` match rosters. Throws if there aren't enough distinct active
 * bots to fill the smallest table (K=4 needs >= 4 active bots).
 */
export function generateRosters(opts: RosterOptions): Roster[] {
    if (opts.changed.length === 0) return [];
    const pool = opts.pool;
    if (pool.length < 4) {
        throw new Error(`roster generation needs >= 4 active bots, have ${pool.length}`);
    }
    const rng = new Rng(opts.seed);
    const diversityMemory = opts.diversityMemory ?? 8;
    const recent: string[] = [];
    const rosters: Roster[] = [];

    for (let i = 0; i < opts.budget; i++) {
        const k = rng.int(4, 6);
        const changedId = opts.changed[i % opts.changed.length]!;
        // Cap K to what the pool can fill with distinct bots.
        const effectiveK = Math.min(k, pool.length);

        let roster: Roster = [];
        // Try up to 3 times to avoid a back-to-back duplicate composition.
        for (let attempt = 0; attempt < 3; attempt++) {
            const seated = new Set<string>([changedId]);
            const picked: string[] = [changedId];
            while (picked.length < effectiveK) {
                const candidates = pool.filter((p) => !seated.has(p.id));
                if (candidates.length === 0) break;
                const chosen = weightedPick(candidates, rng);
                seated.add(chosen.id);
                picked.push(chosen.id);
            }
            roster = picked;
            const key = compositionKey(roster);
            if (!recent.includes(key)) break;
        }
        rosters.push(roster);
        recent.push(compositionKey(roster));
        if (recent.length > diversityMemory) recent.shift();
    }
    return rosters;
}
