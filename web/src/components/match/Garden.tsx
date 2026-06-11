import type { MatchView } from '../../engine/controller.ts';
import { Panel } from '../Panel.tsx';

/** The garden: each seat's row fills with glyph-seeds as it plants. */
export function Garden({ view }: { view: MatchView }) {
    const plantById = new Map(view.plants.map((p) => [p.id, p.plant] as const));
    const o = view.lastOutcome;
    return (
        <Panel label="THE GARDEN">
            <p className="muted" aria-live="polite">
                Round {view.round || '—'} {view.phase ? `· phase: ● ${view.phase.toUpperCase()}` : ''}
            </p>
            <div style={{ fontSize: '1.2rem', lineHeight: 1.7 }}>
                {view.seats.map((s) => {
                    const planted = plantById.get(s.id);
                    const seeds = planted == null ? '' : '🌱'.repeat(planted) + '·'.repeat(10 - planted);
                    return (
                        <div key={s.id}>
                            <span title={s.name}>{s.glyph}</span> {seeds}
                            {planted != null && <span className="muted"> {s.name} planted {planted}</span>}
                        </div>
                    );
                })}
            </div>
            {o && (
                <p className="muted" style={{ marginTop: '0.6rem' }}>
                    garden total {o.garden.gardenTotal} · payout {o.garden.gardenPayout.toFixed(1)} ea.
                    {o.garden.taxTarget && <> · tax → {o.garden.taxTarget} ({o.garden.taxCollected})</>}
                </p>
            )}
        </Panel>
    );
}
