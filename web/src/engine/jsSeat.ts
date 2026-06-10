// In-browser JS-strategy seat for the Bot Builder (architecture §5, UI §4).
//
// The Builder is EXHIBITION ONLY — it never submits to the tournament — so a
// user's strategy runs directly as a JS seat implementing the shared Seat
// interface, rather than being componentized. A runtime error in any call is
// caught and degraded to the documented default (WATCH / 0 / abstain), exactly
// like a trapped wasm seat, so a buggy strategy can't crash the match.
//
// To package a strategy as a REAL gardener component, see the "Export as OCI"
// link-out — this editor is an on-ramp, not a backdoor into the tournament.

import type { Seat, RoundState, MatchContext, MatchSummary, Signal, Ballot } from '../../../game/src/types.ts';
import type { SeatEntry } from './controller.ts';

type StrategyFn = (state: RoundState, me: StrategyMe) => unknown;
interface Strategy {
    talk?: StrategyFn;
    plant?: StrategyFn;
    vote?: StrategyFn;
    matchStart?: (ctx: MatchContext, me: StrategyMe) => unknown;
    matchEnd?: (summary: MatchSummary, me: StrategyMe) => unknown;
}
interface StrategyMe {
    id: string;
    /** Scratch cross-round memory (in-memory; exhibition only). */
    store: Map<string, unknown>;
}

export interface JsSeatResult {
    entry: SeatEntry;
    /** Compile error, if the user's code didn't parse. */
    error: string | null;
}

/**
 * Compile a user strategy and wrap it as a seat entry. The user's code is a
 * module body that may declare `talk`, `plant`, `vote` (and optional
 * `matchStart` / `matchEnd`) functions taking `(state, me)`. `console.log`
 * output is captured as banter.
 */
export function createJsSeat(code: string, id: string, glyph: string, name: string): JsSeatResult {
    const out: string[] = [];
    const consoleProxy = {
        log: (...args: unknown[]) => out.push(args.map(String).join(' ')),
        info: (...args: unknown[]) => out.push(args.map(String).join(' ')),
        warn: (...args: unknown[]) => out.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => out.push(args.map(String).join(' ')),
    };

    let strategy: Strategy = {};
    let error: string | null = null;
    const me: StrategyMe = { id, store: new Map() };
    try {
        // eslint-disable-next-line no-new-func
        const factory = new Function(
            'me',
            'console',
            `"use strict";\n${code}\n return {` +
                `talk: typeof talk === 'function' ? talk : undefined,` +
                `plant: typeof plant === 'function' ? plant : undefined,` +
                `vote: typeof vote === 'function' ? vote : undefined,` +
                `matchStart: typeof matchStart === 'function' ? matchStart : undefined,` +
                `matchEnd: typeof matchEnd === 'function' ? matchEnd : undefined,` +
                `};`,
        );
        strategy = (factory(me, consoleProxy) ?? {}) as Strategy;
    } catch (e) {
        error = (e as Error).message;
    }

    function guard<T>(fn: StrategyFn | undefined, state: RoundState, fallback: T): T {
        if (!fn) return fallback;
        try {
            const v = fn(state, me);
            return (v === undefined ? fallback : v) as T;
        } catch (e) {
            out.push(`⚠ ${(e as Error).message}`);
            return fallback;
        }
    }

    const seat: Seat = {
        id,
        metadata: () => ({ name, version: '0.0.0', author: 'you', repo: '', lore: 'A Bot Builder strategy.', glyph, icon: null }),
        matchStart: (ctx: MatchContext) => {
            try {
                strategy.matchStart?.(ctx, me);
            } catch (e) {
                out.push(`⚠ matchStart: ${(e as Error).message}`);
            }
        },
        talk: (state: RoundState): Signal => guard<Signal>(strategy.talk, state, 'watch'),
        plant: (state: RoundState): number => guard<number>(strategy.plant, state, 0),
        vote: (state: RoundState): Ballot => {
            const v = guard<unknown>(strategy.vote, state, null);
            return (typeof v === 'string' ? v : null) as Ballot;
        },
        matchEnd: (summary: MatchSummary) => {
            try {
                strategy.matchEnd?.(summary, me);
            } catch (e) {
                out.push(`⚠ matchEnd: ${(e as Error).message}`);
            }
        },
    };

    return {
        error,
        entry: {
            seat,
            view: { id, glyph, name },
            stdout: () => out.join('\n'),
            dispose: () => {},
        },
    };
}
