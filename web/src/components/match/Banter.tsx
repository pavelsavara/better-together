import { useEffect, useRef } from 'react';
import type { MatchView } from '../../engine/controller.ts';

/** Streams each seat's captured stdout as in-character banter (stderr hidden). */
export function Banter({ view }: { view: MatchView }) {
    const ref = useRef<HTMLDivElement | null>(null);
    const glyphById = new Map(view.seats.map((s) => [s.id, s.glyph] as const));
    const nameById = new Map(view.seats.map((s) => [s.id, s.name] as const));

    useEffect(() => {
        if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    }, [view.banter.length]);

    return (
        <div className="panel">
            <h2>═══| BANTER |═══</h2>
            <div ref={ref} style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                {view.banter.length === 0 ? (
                    <p className="muted">…stdout per seat…</p>
                ) : (
                    view.banter.map((line, i) => (
                        <div key={i}>
                            <span className="muted">{glyphById.get(line.id) ?? ''} {nameById.get(line.id) ?? line.id}:</span>{' '}
                            {/* Bot-supplied stdout rendered as TEXT only. */}
                            {line.text}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
