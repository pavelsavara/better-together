import { useMemo, useState } from 'react';
import { marked } from 'marked';
import { Panel } from '../components/Panel.tsx';
// The repo's own docs are rendered (trusted content); links/anchors kept.
import playerRules from '../../../docs/player-rules.md?raw';
import engineRules from '../../../docs/engine-rules.md?raw';

type Doc = 'player' | 'engine';

export function Rules() {
    const [doc, setDoc] = useState<Doc>('player');
    const html = useMemo(() => marked.parse(doc === 'player' ? playerRules : engineRules, { async: false }) as string, [doc]);

    return (
        <Panel label="RULES">
            <div className="tabs">
                <button className={`tab ${doc === 'player' ? 'active' : ''}`} onClick={() => setDoc('player')}>Player Rules</button>
                <button className={`tab ${doc === 'engine' ? 'active' : ''}`} onClick={() => setDoc('engine')}>Engine Rules</button>
            </div>
            {/* Trusted, repo-owned markdown rendered to HTML. */}
            <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />
        </Panel>
    );
}
