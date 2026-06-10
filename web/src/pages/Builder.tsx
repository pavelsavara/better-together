import { useMemo, useState } from 'react';
import { useStore } from '../data/store.tsx';
import { useMatch } from '../engine/useMatch.ts';
import { createJsSeat } from '../engine/jsSeat.ts';
import { createBotEntry, type SeatEntry } from '../engine/controller.ts';
import { Garden } from '../components/match/Garden.tsx';
import { ScoresPanel } from '../components/match/ScoresPanel.tsx';
import { TalkVotesTax } from '../components/match/TalkVotesTax.tsx';
import { Banter } from '../components/match/Banter.tsx';

const EXAMPLES: Record<string, string> = {
    'All-Bloom (altruist)': `// Always signal bloom, plant everything, never tax.
function talk(state, me) { return 'bloom'; }
function plant(state, me) { return 10; }
function vote(state, me) { return null; }`,
    'Tit-for-Tat': `// Mirror the group's average plant from last round.
function talk(state, me) { return 'bloom'; }
function plant(state, me) {
  const last = state.history[state.history.length - 1];
  if (!last) return 8;
  const others = last.actions.filter(a => a.id !== me.id);
  const avg = others.reduce((s, a) => s + a.plant, 0) / Math.max(1, others.length);
  return Math.round(avg);
}
function vote(state, me) {
  // Tax the biggest hoarder this round (most seeds kept).
  let worst = null, max = -1;
  for (const a of state.plants) {
    const kept = 10 - a.plant;
    if (a.id !== me.id && kept > max) { max = kept; worst = a.id; }
  }
  return worst;
}`,
    'Guild Boss (coalition)': `// Plant generously, rally with bloom, bloc-vote the fattest hoarder.
function talk(state, me) { return 'bloom'; }
function plant(state, me) { return 9; }
function vote(state, me) {
  let worst = null, max = 2; // untaxable minimum
  for (const a of state.plants) {
    const kept = 10 - a.plant;
    if (a.id !== me.id && kept > max) { max = kept; worst = a.id; }
  }
  console.log(worst ? 'taxing the hoarder ' + worst : 'all clear');
  return worst;
}`,
};

function randomSeed(): string {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return [...a].map((n) => n.toString(16).padStart(8, '0')).join('');
}

export function Builder() {
    const { index } = useStore();
    const { view, loadEntries, step, play, pause } = useMatch();
    const bots = useMemo(() => index?.bots.filter((b) => b.status === 'active') ?? [], [index]);

    const [code, setCode] = useState(EXAMPLES['All-Bloom (altruist)']!);
    const [seed, setSeed] = useState(randomSeed());
    const [k, setK] = useState(4);
    const [opponents, setOpponents] = useState<Set<string>>(new Set());
    const [compileError, setCompileError] = useState<string | null>(null);

    const baseUrl = import.meta.env.BASE_URL;

    function toggle(id: string) {
        setOpponents((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function runTest() {
        const js = createJsSeat(code, 'builder.you', '🧑‍🌾', 'builder.you');
        setCompileError(js.error);
        if (js.error) return;
        const chosen = bots.filter((b) => opponents.has(b.id)).slice(0, k - 1);
        try {
            const oppEntries: SeatEntry[] = [];
            for (const bot of chosen) oppEntries.push(await createBotEntry(bot, baseUrl));
            await loadEntries([js.entry, ...oppEntries], seed);
            play(600);
        } catch (e) {
            setCompileError((e as Error).message);
        }
    }

    const canRun = opponents.size >= 1 && view.status !== 'loading' && view.status !== 'running';

    return (
        <>
            <div className="panel">
                <h2>═══| BOT BUILDER |═══</h2>
                <p className="muted">
                    Write <code>talk</code>, <code>plant</code>, and <code>vote</code> functions
                    <code>(state, me)</code>. Runtime errors fall back to the defaults (WATCH / 0 / abstain). This
                    editor is an on-ramp — it never submits to the tournament.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div className="field">
                        <label htmlFor="code">strategy.js</label>
                        <textarea
                            id="code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            spellCheck={false}
                            rows={18}
                            style={{ fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                        />
                        <div style={{ marginTop: '0.5rem' }}>
                            <label htmlFor="example" className="muted">Load example: </label>
                            <select id="example" onChange={(e) => e.target.value && setCode(EXAMPLES[e.target.value]!)} defaultValue="">
                                <option value="">—</option>
                                {Object.keys(EXAMPLES).map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <div className="field">
                            <label>Opponents (pick ≥ 1)</label>
                            {bots.length === 0 ? (
                                <p className="muted">No registered bots to play against.</p>
                            ) : (
                                bots.map((b) => (
                                    <label key={b.id} style={{ display: 'block' }}>
                                        <input type="checkbox" checked={opponents.has(b.id)} onChange={() => toggle(b.id)} style={{ width: 'auto', marginRight: '0.3rem' }} />
                                        {b.glyph} {b.name}
                                    </label>
                                ))
                            )}
                        </div>
                        <div className="field">
                            <label>K (seats)</label>
                            {[4, 5, 6].map((n) => (
                                <label key={n} style={{ display: 'inline', marginRight: '0.8rem' }}>
                                    <input type="radio" name="bk" checked={k === n} onChange={() => setK(n)} style={{ width: 'auto', marginRight: '0.3rem' }} />
                                    {n}
                                </label>
                            ))}
                        </div>
                        <div className="field">
                            <label htmlFor="bseed">Seed</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input id="bseed" value={seed} onChange={(e) => setSeed(e.target.value)} />
                                <button className="btn" onClick={() => setSeed(randomSeed())}>🎲</button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <button className="btn" onClick={runTest} disabled={!canRun}>▶ Test match</button>
                            <button className="btn" onClick={() => pause()} disabled={view.status !== 'running'}>⏸</button>
                            <button className="btn" onClick={() => step()} disabled={view.status !== 'paused'}>⤼ Step</button>
                        </div>
                        <p className="muted" style={{ marginTop: '0.5rem' }}>
                            <a href="https://component-model.bytecodealliance.org/composing-and-distributing/distributing.html" target="_blank" rel="noreferrer">
                                ⤓ Export as OCI… ↗
                            </a>
                        </p>
                    </div>
                </div>
                {compileError && <p className="warn">Compile error: {compileError}</p>}
                {view.status === 'error' && <p className="warn">Match error: {view.error}</p>}
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
