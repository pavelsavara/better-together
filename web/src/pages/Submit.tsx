import { useMemo, useState } from 'react';
import { Panel } from '../components/Panel.tsx';

// TODO: set to the real repository once published, e.g. "owner/better-together".
const REPO = 'OWNER/better-together';

export function Submit() {
    const [oci, setOci] = useState('');
    const [author, setAuthor] = useState('');
    const [blurb, setBlurb] = useState('');

    const href = useMemo(() => {
        const params = new URLSearchParams({ template: 'submit-gardener.yml' });
        if (oci) params.set('oci', oci);
        if (author) params.set('author', author);
        if (blurb) params.set('blurb', blurb);
        return `https://github.com/${REPO}/issues/new?${params.toString()}`;
    }, [oci, author, blurb]);

    const ready = oci.trim() && author.trim() && blurb.trim();

    return (
        <Panel label="SUBMIT A GARDENER">
            <p>Your bot is a WASI 0.2 component published as an OCI artifact.</p>

            <div className="field">
                <label htmlFor="oci">OCI image reference *</label>
                <input id="oci" value={oci} onChange={(e) => setOci(e.target.value)} placeholder="ghcr.io/yourname/yourbot:1.0.0" />
            </div>
            <div className="field">
                <label htmlFor="author">Author handle *</label>
                <input id="author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="@yourname" />
            </div>
            <div className="field">
                <label htmlFor="blurb">Short description *</label>
                <input id="blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="One line on what your gardener does" />
            </div>

            <p className="muted">
                ⓘ A maintainer approves, then we pull this image, extract the .wasm, and validate it. Metadata
                (name, glyph, lore, …) comes from the bundle.
            </p>

            <p>
                <a className="btn" href={ready ? href : undefined} target="_blank" rel="noreferrer" aria-disabled={!ready} style={ready ? undefined : { opacity: 0.5, pointerEvents: 'none' }}>
                    Open prefilled GitHub issue ↗
                </a>
            </p>
            <p className="muted">What happens next: maintainer approval → validate → comment → appear on Top Scores.</p>
        </Panel>
    );
}
