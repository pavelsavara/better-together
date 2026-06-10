import { Link } from 'react-router-dom';
import { useStore } from '../data/store.tsx';

export function Home() {
    const { index, loading } = useStore();
    const bots = index?.bots.filter((b) => b.status === 'active') ?? [];

    return (
        <>
            <div className="panel">
                <h2>═══| BETTER TOGETHER |═══</h2>
                <p>
                    A permanent, cooperative-dilemma tournament for WebAssembly gardener bots. Watch seeded matches
                    run live in your browser, or climb the <Link to="/scores">Top Scores</Link> leaderboard.
                </p>
                <p className="muted">The live in-browser match arrives in the next phase.</p>
            </div>

            <div className="panel">
                <h2>Registered gardeners</h2>
                {loading ? (
                    <p className="muted">Loading…</p>
                ) : bots.length === 0 ? (
                    <p className="muted">No bots registered yet. <Link to="/submit">Submit one →</Link></p>
                ) : (
                    <ul>
                        {bots.map((b) => (
                            <li key={b.id}>
                                <Link to={`/bot/${encodeURIComponent(b.id)}`}>{b.glyph} {b.name}</Link>{' '}
                                <span className="muted">v{b.version}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    );
}
