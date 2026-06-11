import type { CSSProperties, ReactNode } from 'react';
import './Panel.css';

const FRAME_BASE = `${import.meta.env.BASE_URL}frame/`;
const url = (name: string) => `url(${FRAME_BASE}${name})`;

export interface PanelProps {
    /** Panel body. */
    children?: ReactNode;
    /** Title shown in the bottom-center button box. Omit to leave it empty. */
    label?: ReactNode;
    /** If set, the box renders as a clickable button invoking this handler. */
    onLabelClick?: () => void;
    /** Whole-frame chrome scale (native pieces are large). Defaults to 0.25. */
    scale?: number;
    /** Extra class names for the outer frame element. */
    className?: string;
    /** Extra inline styles for the outer frame element (e.g. width/height). */
    style?: CSSProperties;
}

/**
 * Ornamental botanical-terminal frame, assembled from the 9-slice PNG pieces in
 * web/public/frame/. Edges tile responsively (background-repeat); corners and
 * the bottom-center button box are fixed. The button box holds the section
 * title; content renders inside the chrome above it.
 */
export function Panel({ children, label, onLabelClick, scale = 0.25, className, style }: PanelProps) {
    const frameStyle = { '--pf-s': String(scale), ...style } as CSSProperties;
    const classes = ['pf-frame'];
    if (label != null) classes.push('pf-has-header');
    if (className) classes.push(className);
    return (
        <div className={classes.join(' ')} style={frameStyle}>
            <div className="pf-edge-top" style={{ backgroundImage: url('edge-top.png') }} />
            <div className="pf-edge-left" style={{ backgroundImage: url('edge-left.png') }} />
            <div className="pf-edge-right" style={{ backgroundImage: url('edge-right.png') }} />
            <div className="pf-edge-bottom-l" style={{ backgroundImage: url('edge-bottom.png') }} />
            <div className="pf-edge-bottom-r" style={{ backgroundImage: url('edge-bottom.png') }} />

            <div className="pf-center-bottom" style={{ backgroundImage: url('center-bottom.png') }}>
                {label != null &&
                    (onLabelClick ? (
                        <button type="button" className="pf-label" onClick={onLabelClick}>
                            {label}
                        </button>
                    ) : (
                        <span className="pf-label">{label}</span>
                    ))}
            </div>

            <div className="pf-corner pf-corner-tl" style={{ backgroundImage: url('corner-tl.png') }} />
            <div className="pf-corner pf-corner-tr" style={{ backgroundImage: url('corner-tr.png') }} />
            <div className="pf-corner pf-corner-bl" style={{ backgroundImage: url('corner-bl.png') }} />
            <div className="pf-corner pf-corner-br" style={{ backgroundImage: url('corner-br.png') }} />

            <div className="pf-content">{children}</div>
        </div>
    );
}
