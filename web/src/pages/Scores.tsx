import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store.tsx';
import { Panel } from '../components/Panel.tsx';
import type { ScoreRow, BotRecord } from '../data/types.ts';

type Tab = 'coplayer' | 'raw';

/** A co-player score bar with a ± confidence whisker (from coPlayerStdErr). */
function Whisker({ row, max }: { row: ScoreRow; max: number }) {
    const width = 90;
    const center = Math.max(0, Math.min(1, (row.coPlayerScore + max) / (2 * max)));
    const errFrac = Math.min(0.5, row.coPlayerStdErr / (2 * max));
    return (
        <span className="whisker">
            <span>{row.coPlayerScore >= 0 ? '+' : ''}{row.coPlayerScore.toFixed(2)}</span>
            <span className="bar" aria-hidden>
                <span className="fill" style={{ left: '50%', width: `${Math.abs(center - 0.5) * width}px`, transform: center < 0.5 ? 'translateX(-100%)' : undefined }} />
                <span className="err" style={{ left: `${(center - errFrac) * 100}%`, width: `${errFrac * 2 * 100}%` }} />
            </span>
        </span>
    );
}

export function Scores() {
    const { scores, index, loading, error } = useStore();
    const [tab, setTab] = useState<Tab>('coplayer');

    const nameById = useMemo(() => {
        const m = new Map<string, BotRecord>();
        for (const b of index?.bots ?? []) m.set(b.id, b);
        return m;
    }, [index]);

    if (loading) return <Panel><p className="muted">Loading…</p></Panel>;
    if (error) return <Panel><p className="warn">Could not load scores: {error}</p></Panel>;
    if (!scores) return <Panel label="Top Scores"><p className="muted">No scores yet — the tournament hasn’t run.</p></Panel>;

    const ranked = scores.leaderboard.filter((r) => r.ranked);
    const unranked = scores.leaderboard.filter((r) => !r.ranked);
    const sorted = tab === 'raw' ? [...ranked].sort((a, b) => b.rawScore - a.rawScore) : ranked;
    const maxAbs = Math.max(1, ...ranked.map((r) => Math.abs(r.coPlayerScore) + r.coPlayerStdErr));

    return (
        <Panel label="LEADERBOARD">
            <div className="tabs">
                <button className={`tab ${tab === 'coplayer' ? 'active' : ''}`} onClick={() => setTab('coplayer')}>Best Co-Player</button>
                <button className={`tab ${tab === 'raw' ? 'active' : ''}`} onClick={() => setTab('raw')}>Raw Score</button>
            </div>
            <p className="muted">
                window: each bot’s last {scores.window.matchesPerBot} matches · updated {scores.computedAt}
            </p>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>bot</th>
                        <th>{tab === 'raw' ? 'raw' : 'co-player'}</th>
                        <th>raw</th>
                        <th>consistency</th>
                        <th>matches</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((r) => (
                        <Row key={r.id} row={r} bot={nameById.get(r.id)} tab={tab} maxAbs={maxAbs} />
                    ))}
                </tbody>
            </table>

            {unranked.length > 0 && (
                <>
                    <h3>Unranked (still settling — &lt; {scores.minMatchesToRank} matches)</h3>
                    <table>
                        <tbody>
                            {unranked.map((r) => (
                                <tr key={r.id}>
                                    <td>–</td>
                                    <td><BotLink row={r} bot={nameById.get(r.id)} /></td>
                                    <td className="muted">~</td>
                                    <td className="muted">–</td>
                                    <td className="muted">–</td>
                                    <td>{r.matchesInWindow} <span className="badge">new</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
        </Panel>
    );
}

function Row({ row, bot, tab, maxAbs }: { row: ScoreRow; bot: BotRecord | undefined; tab: Tab; maxAbs: number }) {
    const selfish = row.rawScore > 0 && row.coPlayerScore < 0;
    return (
        <tr>
            <td>{row.rank}</td>
            <td><BotLink row={row} bot={bot} /></td>
            <td>{tab === 'raw' ? row.rawScore.toFixed(1) : <Whisker row={row} max={maxAbs} />}</td>
            <td>{row.rawScore.toFixed(1)} {selfish && <span className="warn" title="high raw + negative co-player">⚑</span>}</td>
            <td>{row.consistencyStd.toFixed(1)}</td>
            <td>{row.matchesInWindow}</td>
        </tr>
    );
}

function BotLink({ row, bot }: { row: ScoreRow; bot: BotRecord | undefined }) {
    const label = bot ? `${bot.glyph} ${bot.name}` : row.id;
    return <Link to={`/bot/${encodeURIComponent(row.id)}`}>{label}</Link>;
}
