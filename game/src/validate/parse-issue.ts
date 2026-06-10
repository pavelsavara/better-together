// Parse a "Submit a gardener" issue-form body into { oci, author, blurb }
// (docs/architecture.md §3, .github/ISSUE_TEMPLATE/submit-gardener.yml).
//
// GitHub renders an issue *form* submission as Markdown: each field becomes a
// "### <Label>" heading followed by the entered value (or "_No response_" when
// left blank). We extract by label so the parser is order-independent and
// tolerant of surrounding whitespace.

export interface ParsedIssue {
    /** OCI image reference, e.g. ghcr.io/jane/ferris:1.0.0 */
    oci: string;
    /** Author handle as entered (leading '@' stripped). */
    author: string;
    /** One-line description. */
    blurb: string;
}

/** The field labels in .github/ISSUE_TEMPLATE/submit-gardener.yml. */
export const ISSUE_LABELS = {
    oci: 'OCI image reference',
    author: 'Author handle',
    blurb: 'Short description',
} as const;

const NO_RESPONSE = /^_no response_$/i;

/** Split an issue-form body into a label → value map by "### <label>" headings. */
function parseSections(body: string): Map<string, string> {
    const map = new Map<string, string>();
    const re = /^###[ \t]+(.+?)[ \t]*$/gm;
    const headings = [...body.matchAll(re)];
    for (let i = 0; i < headings.length; i++) {
        const h = headings[i]!;
        const label = (h[1] ?? '').trim();
        const start = (h.index ?? 0) + h[0].length;
        const end = i + 1 < headings.length ? headings[i + 1]!.index ?? body.length : body.length;
        map.set(label, body.slice(start, end).trim());
    }
    return map;
}

/** A field's value under its "### <label>" heading, or null if absent/blank. */
function sectionValue(sections: Map<string, string>, label: string): string | null {
    const value = sections.get(label);
    if (value == null || value.length === 0 || NO_RESPONSE.test(value)) return null;
    return value;
}

/**
 * Parse the issue body. Returns the fields plus any missing-field errors. The
 * caller decides whether to reject (a required field missing → reject).
 */
export function parseIssue(body: string): { value: Partial<ParsedIssue>; errors: string[] } {
    const errors: string[] = [];
    const sections = parseSections(body);
    const oci = sectionValue(sections, ISSUE_LABELS.oci);
    const authorRaw = sectionValue(sections, ISSUE_LABELS.author);
    const blurb = sectionValue(sections, ISSUE_LABELS.blurb);

    if (!oci) errors.push(`Missing "${ISSUE_LABELS.oci}".`);
    if (!authorRaw) errors.push(`Missing "${ISSUE_LABELS.author}".`);
    if (!blurb) errors.push(`Missing "${ISSUE_LABELS.blurb}".`);

    const value: Partial<ParsedIssue> = {};
    if (oci) value.oci = oci;
    if (authorRaw) value.author = authorRaw.replace(/^@/, '');
    if (blurb) value.blurb = blurb;
    return { value, errors };
}
