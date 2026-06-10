// Seeded, deterministic RNG for the match engine.
//
// All randomness in a match flows from a single hex seed so a logged match can
// be replayed byte-for-byte (docs/architecture.md §4.5). This module is pure and
// framework-agnostic: no Math.random(), no crypto, no Date — identical output in
// Node and the browser.

/** xmur3 string hash → a 32-bit seed generator (well-known, deterministic). */
function xmur3(str: string): () => number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    };
}

/** mulberry32 PRNG: fast, deterministic, good enough for game randomness. */
function mulberry32(a: number): () => number {
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A deterministic random source seeded from a string. */
export class Rng {
    readonly seed: string;
    #next: () => number;

    constructor(seed: string) {
        this.seed = seed;
        const h = xmur3(seed);
        // Mix four rounds of the hash into the mulberry32 state for a good start.
        this.#next = mulberry32(h());
    }

    /** Next float in [0, 1). */
    float(): number {
        return this.#next();
    }

    /** Integer in [minInclusive, maxInclusive]. */
    int(minInclusive: number, maxInclusive: number): number {
        const lo = Math.ceil(minInclusive);
        const hi = Math.floor(maxInclusive);
        return lo + Math.floor(this.float() * (hi - lo + 1));
    }

    /** True with the given probability (default 0.5). */
    bool(probTrue = 0.5): boolean {
        return this.float() < probTrue;
    }

    /** Fisher-Yates shuffle returning a NEW array (input untouched). */
    shuffle<T>(arr: readonly T[]): T[] {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            const tmp = out[i]!;
            out[i] = out[j]!;
            out[j] = tmp;
        }
        return out;
    }

    /** Derive a stable child seed (for per-match or per-seat randomness). */
    derive(label: string): string {
        // Combine the current draw with the label so siblings differ.
        const salt = Math.floor(this.float() * 0xffffffff) >>> 0;
        return `${this.seed}:${label}:${salt.toString(16).padStart(8, '0')}`;
    }
}

/**
 * Decide the (hidden) number of rounds R for a match: a minimum of `minRounds`
 * (8) guaranteed, then each further round happens with probability
 * `continueProb` (2/3, i.e. a 1/3 hazard). A hard cap guards against runaway
 * matches (docs/engine-rules.md §5).
 */
export function rollRoundCount(rng: Rng, minRounds = 8, continueProb = 2 / 3, hardCap = 200): number {
    let r = minRounds;
    while (r < hardCap && rng.bool(continueProb)) {
        r++;
    }
    return r;
}

/**
 * Derive a per-match seed from a run-level master seed and a match index
 * (docs/architecture.md §4.5). Deterministic given the same inputs.
 */
export function matchSeed(masterSeed: string, matchIndex: number): string {
    const h = xmur3(`${masterSeed}#${matchIndex}`)();
    return h.toString(16).padStart(8, '0') + xmur3(`${matchIndex}#${masterSeed}`)().toString(16).padStart(8, '0');
}
