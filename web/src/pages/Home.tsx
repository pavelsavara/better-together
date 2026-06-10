import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store.tsx';
import { useMatch } from '../engine/useMatch.ts';
import type { BotRecord } from '../data/types.ts';
import { Garden } from '../components/match/Garden.tsx';
import { ScoresPanel } from '../components/match/ScoresPanel.tsx';
import { TalkVotesTax } from '../components/match/TalkVotesTax.tsx';
import { Banter } from '../components/match/Banter.tsx';

function randomSeed(): string {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return [...a].map((n) => n.toString(16).padStart(8, '0')).join('');
}

export function Home() {
    const { index, loading } = useStore();
    const { view, load, step, play, pause } = useMatch();
    const [params, setParams] = useSearchParams();

    const bots = useMemo(() => index?.bots.filter((b) => b.status === 'active') ?? [], [index]);

    const [seed, setSeed] = useState(() => params.get('seed') ?? randomSeed());
    const [k, setK] = useState(4);
    const [delayMs, setDelayMs] = useState(() =>
        typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 1200 : 600,
    );
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Initialize selection from the deep link (?players=) or the first K bots.
    useEffect(() => {
        if (bots.length === 0 || selected.size > 0) return;
        const fromLink = params.get('players')?.split(',').filter(Boolean) ?? [];
        const valid = fromLink.filter((id) => bots.some((b) => b.id === id));
        const initial = valid.length > 0 ? valid : bots.slice(0, Math.min(k, bots.length)).map((b) => b.id);
        setSelected(new Set(initial));
    }, [bots, params, k, selected.size]);

    const baseUrl = import.meta.env.BASE_URL;

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function rosterBots(): BotRecord[] {
        const chosen = bots.filter((b) => selected.has(b.id));
        return chosen.slice(0, k);
    }

    async function run() {
        const roster = rosterBots();
        if (roster.length < 2) return;
        setParams({ seed, players: roster.map((b) => b.id).join(',') }, { replace: true });
        await load(roster, seed, baseUrl);
        play(delayMs);
    }

    const canRun = selected.size >= 2 && view.status !== 'loading' && view.status !== 'running';

    return (
        <>
            <div className="panel">
                <h2>═══| ROSTER &amp; CONTROLS |═══</h2>
                {loading ? (
                    <p className="muted">Loading…</p>
                ) : bots.length === 0 ? (
                    <p className="muted">No bots registered yet.</p>
                ) : (
                    <>
                        <div className="field">
                            <label htmlFor="seed">Seed</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input id="seed" value={seed} onChange={(e) => setSeed(e.target.value)} />
                                <button className="btn" onClick={() => setSeed(randomSeed())}>🎲 New</button>
                            </div>
                        </div>

                        <div className="field">
                            <label>K (seats)</label>
                            {[4, 5, 6].map((n) => (
                                <label key={n} style={{ display: 'inline', marginRight: '1rem' }}>
                                    <input type="radio" name="k" checked={k === n} onChange={() => setK(n)} style={{ width: 'auto', marginRight: '0.3rem' }} />
                                    {n}
                                </label>
                            ))}
                        </div>

                        <div className="field">
                            <label htmlFor="speed">Speed (delay {delayMs} ms)</label>
                            <input id="speed" type="range" min={100} max={1500} step={100} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
                        </div>

                        <div className="field">
                            <label>Players (pick ≥ 2; K caps how many are seated)</label>
                            <div>
                                {bots.map((b) => (
                                    <label key={b.id} style={{ display: 'inline-block', marginRight: '1rem' }}>
                                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} style={{ width: 'auto', marginRight: '0.3rem' }} />
                                        {b.glyph} {b.name}
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn" onClick={run} disabled={!canRun}>▶ Run match</button>
                            <button className="btn" onClick={() => pause()} disabled={view.status !== 'running'}>⏸ Pause</button>
                            <button className="btn" onClick={() => step()} disabled={view.status !== 'paused'}>⤼ Step</button>
                        </div>
                        {view.status === 'error' && <p className="warn">Match error: {view.error}</p>}
                        {view.status === 'done' && <p className="positive">Match complete after {view.round} rounds.</p>}
                    </>
                )}
            </div>

            {view.seats.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0 1rem' }}>
                    <Garden view={view} />
                    <ScoresPanel view={view} />
                    <TalkVotesTax view={view} />
                    <Banter view={view} />
                </div>
            )}
        </>
    );
}
