import type { MatchView } from '../../engine/controller.ts';
import { Panel } from '../Panel.tsx';

const SIGNAL_LABEL: Record<string, string> = { bloom: 'BLOOM', hold: 'HOLD', watch: 'WATCH' };

/** Talk signals, the vote ballots, and the resolved tax for the current round. */
export function TalkVotesTax({ view }: { view: MatchView }) {
    const o = view.lastOutcome;
    const glyphById = new Map(view.seats.map((s) => [s.id, s.glyph] as const));
    return (
        <Panel label="TALK · VOTES · TAX">
            <div>
                <strong className="muted">talk:</strong>{' '}
                {view.signals.length === 0
                    ? <span className="muted">—</span>
                    : view.signals.map((s) => (
                        <span key={s.id} style={{ marginRight: '0.8rem' }}>
                            {glyphById.get(s.id)} {SIGNAL_LABEL[s.signal] ?? s.signal}
                        </span>
                    ))}
            </div>
            <div style={{ marginTop: '0.4rem' }}>
                <strong className="muted">votes:</strong>{' '}
                {o
                    ? o.garden.votes.map((v) => (
                        <span key={v.voter} style={{ marginRight: '0.8rem' }}>
                            {glyphById.get(v.voter)}→{v.target ? glyphById.get(v.target) ?? v.target : '(abstain)'}
                        </span>
                    ))
                    : <span className="muted">—</span>}
            </div>
            <div style={{ marginTop: '0.4rem' }}>
                <strong className="muted">tax:</strong>{' '}
                {o?.garden.taxTarget ? (
                    <span className="warn">
                        → {glyphById.get(o.garden.taxTarget)} {o.garden.taxTarget} · reclaimed {o.garden.taxCollected} → garden
                    </span>
                ) : (
                    <span className="muted">no tax this round</span>
                )}
            </div>
        </Panel>
    );
}
