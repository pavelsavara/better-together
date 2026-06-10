import type { MatchView } from '../../engine/controller.ts';

/** Per-seat round + running score, sorted by running total descending. */
export function ScoresPanel({ view }: { view: MatchView }) {
    const o = view.lastOutcome;
    const rows = view.seats.map((s, i) => ({
        seat: s,
        round: o?.roundScores[i] ?? null,
        total: view.runningTotals[i] ?? 0,
    }));
    rows.sort((a, b) => b.total - a.total);
    return (
        <div className="panel">
            <h2>═══| SCORES |═══</h2>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>bot</th>
                        <th>round</th>
                        <th>total</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.seat.id}>
                            <td>{i + 1}</td>
                            <td title={r.seat.name}>{r.seat.glyph} {r.seat.name}</td>
                            <td>{r.round == null ? '—' : r.round.toFixed(1)}</td>
                            <td>{r.total.toFixed(1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {o && (
                <p className="muted">
                    garden total: {o.garden.gardenTotal} · payout/player: {o.garden.gardenPayout.toFixed(1)}
                </p>
            )}
        </div>
    );
}
