// Browser match controller: loads gardener components same-origin via jsco,
// drives the SHARED core match driver one phase at a time, and exposes an
// observable view the UI animates (architecture §5). Exhibition only — nothing
// here affects the official leaderboard.

import { createGardenerSeat } from '../../../game/src/host/seat.ts';
import { createMatchDriver, type MatchDriver } from '../../../game/src/core/match.ts';
import type { Seat } from '../../../game/src/types.ts';
import type { BotRecord, SignalBroadcast, PlayerAction, RoundOutcome } from '../data/types.ts';

export interface SeatView {
    id: string;
    glyph: string;
    name: string;
}

/** A seat plus the bits the controller needs for banter + teardown. */
export interface SeatEntry {
    seat: Seat;
    view: SeatView;
    stdout: () => string;
    dispose: () => void;
}

/** Build a seat entry for a registered bot: fetch its wasm same-origin + seat it. */
export async function createBotEntry(bot: BotRecord, baseUrl: string): Promise<SeatEntry> {
    const res = await fetch(`${baseUrl}${bot.wasm}`);
    if (!res.ok) throw new Error(`fetch ${bot.wasm}: HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const seat = await createGardenerSeat(bytes, { id: bot.id, callBudgetMs: 0 });
    return {
        seat,
        view: { id: bot.id, glyph: bot.glyph, name: bot.name },
        stdout: () => seat.stdout(),
        dispose: () => seat.dispose(),
    };
}

export type MatchStatus = 'idle' | 'loading' | 'running' | 'paused' | 'done' | 'error';
export type Phase = 'talk' | 'plant' | 'vote' | null;

export interface MatchView {
    status: MatchStatus;
    round: number;
    phase: Phase;
    seats: SeatView[];
    signals: SignalBroadcast[];
    plants: PlayerAction[];
    lastOutcome: RoundOutcome | null;
    runningTotals: number[];
    banter: Array<{ id: string; text: string }>;
    seed: string;
    error: string | null;
}

const EMPTY: MatchView = {
    status: 'idle',
    round: 0,
    phase: null,
    seats: [],
    signals: [],
    plants: [],
    lastOutcome: null,
    runningTotals: [],
    banter: [],
    seed: '',
    error: null,
};

export class MatchController {
    #view: MatchView = { ...EMPTY };
    #driver: MatchDriver | null = null;
    #entries: SeatEntry[] = [];
    #stdoutLen = new Map<string, number>();
    #playing = false;
    #timer: ReturnType<typeof setTimeout> | null = null;
    #onChange: (v: MatchView) => void;
    /** Cap retained banter lines so a long match can't grow memory unbounded. */
    static readonly BANTER_CAP = 200;

    constructor(onChange: (v: MatchView) => void) {
        this.#onChange = onChange;
    }

    get view(): MatchView {
        return this.#view;
    }

    #emit(patch: Partial<MatchView>) {
        this.#view = { ...this.#view, ...patch };
        if (this.#view.banter.length > MatchController.BANTER_CAP) {
            this.#view = { ...this.#view, banter: this.#view.banter.slice(-MatchController.BANTER_CAP) };
        }
        this.#onChange(this.#view);
    }

    /** Load the roster, instantiate seats, and begin the match (idle at round 1). */
    async load(bots: BotRecord[], seed: string, baseUrl: string): Promise<void> {
        this.dispose();
        this.#emit({ ...EMPTY, status: 'loading', seed });
        try {
            const entries: SeatEntry[] = [];
            for (const bot of bots) {
                entries.push(await createBotEntry(bot, baseUrl));
            }
            await this.#begin(entries, seed);
        } catch (e) {
            this.#emit({ status: 'error', error: (e as Error).message });
        }
    }

    /** Begin a match over caller-built seat entries (Bot Builder mixed roster). */
    async loadEntries(entries: SeatEntry[], seed: string): Promise<void> {
        this.dispose();
        this.#emit({ ...EMPTY, status: 'loading', seed });
        try {
            await this.#begin(entries, seed);
        } catch (e) {
            this.#emit({ status: 'error', error: (e as Error).message });
        }
    }

    async #begin(entries: SeatEntry[], seed: string): Promise<void> {
        this.#entries = entries;
        const driver = createMatchDriver({ matchId: `live-${seed}`, seed, seats: entries.map((e) => e.seat) });
        this.#driver = driver;
        await driver.matchStart();
        const byId = new Map(entries.map((e) => [e.view.id, e.view] as const));
        const seatViews: SeatView[] = driver.players.map((id) => byId.get(id) ?? { id, glyph: '🌱', name: id });
        this.#emit({
            status: 'paused',
            round: 1,
            phase: 'talk',
            seats: seatViews,
            runningTotals: driver.players.map(() => 0),
        });
    }

    #collectBanter(): Array<{ id: string; text: string }> {
        const lines: Array<{ id: string; text: string }> = [];
        for (const entry of this.#entries) {
            const out = entry.stdout();
            const prev = this.#stdoutLen.get(entry.view.id) ?? 0;
            if (out.length > prev) {
                const fresh = out.slice(prev).trim();
                this.#stdoutLen.set(entry.view.id, out.length);
                for (const line of fresh.split('\n')) {
                    if (line.trim()) lines.push({ id: entry.view.id, text: line.trim() });
                }
            }
        }
        return lines;
    }

    /** Advance exactly one phase (talk → plant → vote → next round). */
    async step(): Promise<void> {
        const driver = this.#driver;
        if (!driver) return;
        const v = this.#view;
        if (v.status === 'done' || v.status === 'error') return;
        try {
            if (v.phase === 'talk') {
                const signals = await driver.talk();
                this.#emit({ signals, phase: 'plant', banter: [...v.banter, ...this.#collectBanter()] });
            } else if (v.phase === 'plant') {
                const plants = await driver.plant();
                this.#emit({ plants, phase: 'vote', banter: [...this.#view.banter, ...this.#collectBanter()] });
            } else if (v.phase === 'vote') {
                const outcome = await driver.vote();
                const banter = [...this.#view.banter, ...this.#collectBanter()];
                if (outcome.matchOver) {
                    await driver.matchEnd();
                    this.#emit({
                        lastOutcome: outcome,
                        runningTotals: outcome.runningTotals,
                        status: 'done',
                        phase: null,
                        banter,
                    });
                    this.#playing = false;
                } else {
                    this.#emit({
                        lastOutcome: outcome,
                        runningTotals: outcome.runningTotals,
                        round: outcome.round + 1,
                        phase: 'talk',
                        signals: [],
                        plants: [],
                        banter,
                    });
                }
            }
        } catch (e) {
            this.#emit({ status: 'error', error: (e as Error).message });
            this.#playing = false;
        }
    }

    /** Auto-advance with a per-phase delay (ms) until done or paused. */
    play(delayMs: number): void {
        if (this.#playing || !this.#driver) return;
        this.#playing = true;
        this.#emit({ status: 'running' });
        const tick = async () => {
            if (!this.#playing) return;
            await this.step();
            if (this.#view.status === 'done' || this.#view.status === 'error') {
                this.#playing = false;
                return;
            }
            this.#timer = setTimeout(tick, delayMs);
        };
        this.#timer = setTimeout(tick, delayMs);
    }

    pause(): void {
        this.#playing = false;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = null;
        if (this.#view.status === 'running') this.#emit({ status: 'paused' });
    }

    dispose(): void {
        this.pause();
        for (const entry of this.#entries) {
            try {
                entry.dispose();
            } catch {
                /* ignore */
            }
        }
        this.#entries = [];
        this.#driver = null;
        this.#stdoutLen.clear();
    }
}
