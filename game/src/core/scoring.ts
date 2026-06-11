// Leaderboard scoring (docs/engine-rules.md §7-§9, architecture §4.4).
//
// Computed over a per-bot trailing window of recent matches. The Co-Player score
// is each bot's mean group_total minus the field's mean group_total (an
// approximate Shapley value); Raw is its mean match score; consistency is the
// stddev of group_total in its matches. A bot is listed but UNRANKED until it has
// >= minMatchesToRank matches in its window. Pure + deterministic.

import type { MatchLog, Scores, ScoreRow } from '../types.ts';

export interface ScoringConfig {
    /** Per-bot trailing window size, in matches. */
    windowPerBot: number;
    /** A bot stays unranked until it has at least this many windowed matches. */
    minMatchesToRank: number;
}

export const DEFAULT_SCORING: ScoringConfig = { windowPerBot: 500, minMatchesToRank: 50 };

function mean(xs: readonly number[]): number {
    if (xs.length === 0) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n-1); 0 for fewer than two samples. */
function sampleStd(xs: readonly number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    const variance = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
    return Math.sqrt(variance);
}

interface BotAgg {
    groupTotals: number[];
    matchScores: number[];
}

/**
 * Compute the leaderboard from a set of recent matches. The baseline field mean
 * is taken over ALL provided matches (the global recent window), and is the same
 * mean subtracted for every bot, so weighted opponent sampling (roster §4.3)
 * doesn't bias the Co-Player numerator.
 */
export function computeScores(
    matches: readonly MatchLog[],
    config: ScoringConfig = DEFAULT_SCORING,
    computedAt: string = new Date().toISOString(),
): Scores {
    // Newest-first by matchId (timestamp-sortable) so per-bot windows are recent.
    const ordered = [...matches].sort((a, b) => (a.matchId < b.matchId ? 1 : a.matchId > b.matchId ? -1 : 0));

    const baselineMeanGroupTotal = mean(ordered.map((m) => m.groupTotal));

    // Accumulate each bot's windowed group totals + match scores, newest-first.
    const counts = new Map<string, number>();
    const agg = new Map<string, BotAgg>();
    for (const m of ordered) {
        for (const s of m.scores) {
            const seen = counts.get(s.id) ?? 0;
            if (seen >= config.windowPerBot) continue; // window full for this bot
            counts.set(s.id, seen + 1);
            let a = agg.get(s.id);
            if (!a) {
                a = { groupTotals: [], matchScores: [] };
                agg.set(s.id, a);
            }
            a.groupTotals.push(m.groupTotal);
            a.matchScores.push(s.matchScore);
        }
    }

    const rows: ScoreRow[] = [];
    for (const [id, a] of agg) {
        const n = a.groupTotals.length;
        const consistencyStd = sampleStd(a.groupTotals);
        rows.push({
            id,
            rank: null, // assigned below for ranked bots
            ranked: n >= config.minMatchesToRank,
            coPlayerScore: mean(a.groupTotals) - baselineMeanGroupTotal,
            coPlayerStdErr: n > 0 ? consistencyStd / Math.sqrt(n) : 0,
            rawScore: mean(a.matchScores),
            consistencyStd,
            matchesInWindow: n,
        });
    }

    // Order: ranked first (Co-Player desc, consistency asc, raw desc), then
    // unranked (by matches desc, then id for stability). Assign ranks to ranked.
    rows.sort((x, y) => {
        if (x.ranked !== y.ranked) return x.ranked ? -1 : 1;
        if (x.ranked) {
            if (y.coPlayerScore !== x.coPlayerScore) return y.coPlayerScore - x.coPlayerScore;
            if (x.consistencyStd !== y.consistencyStd) return x.consistencyStd - y.consistencyStd;
            if (y.rawScore !== x.rawScore) return y.rawScore - x.rawScore;
            return x.id.localeCompare(y.id);
        }
        if (y.matchesInWindow !== x.matchesInWindow) return y.matchesInWindow - x.matchesInWindow;
        return x.id.localeCompare(y.id);
    });
    let rank = 0;
    for (const row of rows) {
        if (row.ranked) row.rank = ++rank;
    }

    return {
        version: 1,
        computedAt,
        window: { matchesPerBot: config.windowPerBot },
        minMatchesToRank: config.minMatchesToRank,
        baselineMeanGroupTotal,
        leaderboard: rows,
    };
}
