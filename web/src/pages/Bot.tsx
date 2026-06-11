import { Link, useParams } from 'react-router-dom';
import { useStore } from '../data/store.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { Panel } from '../components/Panel.tsx';

export function Bot() {
    const { id } = useParams();
    const decoded = id ? decodeURIComponent(id) : undefined;
    const { index, scores, loading } = useStore();

    if (loading) return <Panel><p className="muted">Loading…</p></Panel>;
    const bot = decoded ? index?.bots.find((b) => b.id === decoded) : undefined;
    if (!bot) return <Panel label="Bot not found"><p className="muted">No bot with id {decoded}.</p></Panel>;

    const standing = scores?.leaderboard.find((r) => r.id === bot.id);
    const hashSeg = bot.id.split('#')[0] ?? '';
    const iconSrc = bot.icon ? `${import.meta.env.BASE_URL}${bot.icon}` : null;

    return (
        <Panel label="BOT DETAIL">
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <Avatar bot={bot} src={iconSrc} />
                <div>
                    <h3 style={{ margin: '0 0 0.25rem' }}>{bot.glyph} {bot.name} <span className="muted">v{bot.version}</span></h3>
                    <div className="muted">#{hashSeg} · status: {bot.status}</div>
                    <div className="muted">by {bot.author}</div>
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.6rem' }}>
                        <Link className="btn" to={`/?players=${encodeURIComponent(bot.id)}`}>▶ Watch in a match</Link>
                        {bot.repo && <a className="btn" href={bot.repo} target="_blank" rel="noreferrer">repo ↗</a>}
                    </div>
                </div>
            </div>

            {/* Bot-supplied strings are rendered as TEXT, never HTML. */}
            <h3>Lore</h3>
            <p>{bot.lore || <span className="muted">—</span>}</p>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <div>
                    <h3>Standing</h3>
                    {standing ? (
                        standing.ranked ? (
                            <table>
                                <tbody>
                                    <tr><td>co-player</td><td>{standing.coPlayerScore >= 0 ? '+' : ''}{standing.coPlayerScore.toFixed(2)} (#{standing.rank})</td></tr>
                                    <tr><td>raw</td><td>{standing.rawScore.toFixed(1)}</td></tr>
                                    <tr><td>consistency</td><td>{standing.consistencyStd.toFixed(1)}</td></tr>
                                    <tr><td>matches</td><td>{standing.matchesInWindow}</td></tr>
                                    <tr><td>updated</td><td>{bot.matchesSinceUpdate} matches ago</td></tr>
                                </tbody>
                            </table>
                        ) : (
                            <p><span className="badge">unranked — still settling</span> ({standing.matchesInWindow} matches)</p>
                        )
                    ) : (
                        <p className="muted">No standing yet.</p>
                    )}
                </div>
                <div>
                    <h3>Provenance</h3>
                    <table>
                        <tbody>
                            <tr><td>oci</td><td className="muted">{bot.oci}</td></tr>
                            <tr><td>wasm</td><td className="muted">sha256 {bot.wasmSha256.slice(0, 12)}…</td></tr>
                            <tr><td>icon</td><td className="muted">{bot.icon ? 'cached 100×100' : 'glyph only'}</td></tr>
                            <tr><td>submitted</td><td className="muted">by {bot.author} · issue #{bot.issue}</td></tr>
                            <tr><td>approved</td><td className="muted">by {bot.approvedBy}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </Panel>
    );
}
