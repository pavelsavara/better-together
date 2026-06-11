import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a32Hex, manufactureId, parseName, graphemeCount, NAMESPACE_RE } from './id.ts';
import { parseIssue, ISSUE_LABELS } from './parse-issue.ts';
import { isValidIconUrl } from './avatar.ts';

test('fnv1a32Hex is deterministic and 8-char zero-padded hex', () => {
    const a = fnv1a32Hex('ghcr.io/jane/ferris:1.0.0');
    const b = fnv1a32Hex('ghcr.io/jane/ferris:1.0.0');
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{8}$/);
    assert.notEqual(fnv1a32Hex('ghcr.io/jane/ferris:1.0.0'), fnv1a32Hex('ghcr.io/jane/ferris:1.0.1'));
});

test('manufactureId joins the hash and the name with #', () => {
    const id = manufactureId('ghcr.io/jane/ferris:1.0.0', 'together.ferris');
    assert.match(id, /^[0-9a-f]{8}#together\.ferris$/);
});

test('parseName accepts valid namespace.name and rejects malformed', () => {
    assert.deepEqual(parseName('together.ferris'), { namespace: 'together', shortName: 'ferris' });
    assert.deepEqual(parseName('together.Ferris'), { namespace: 'together', shortName: 'Ferris' });
    assert.deepEqual(parseName('to-gether.ferris-2'), { namespace: 'to-gether', shortName: 'ferris-2' });
    assert.equal(parseName('noseparator'), null);
    assert.equal(parseName('two.dots.here'), null);
    assert.equal(parseName('Together.ferris'), null); // uppercase namespace
    assert.equal(parseName('_under.ferris'), null);
    assert.equal(parseName('together.'), null); // empty name
    assert.equal(parseName('.ferris'), null); // empty namespace
});

test('NAMESPACE_RE matches the documented pattern', () => {
    assert.ok(NAMESPACE_RE.test('together'));
    assert.ok(NAMESPACE_RE.test('a1-b2'));
    assert.ok(!NAMESPACE_RE.test('1abc'));
    assert.ok(!NAMESPACE_RE.test('AB'));
});

test('graphemeCount counts an emoji glyph as one', () => {
    assert.equal(graphemeCount('🦀'), 1);
    assert.equal(graphemeCount('ab'), 2);
    assert.equal(graphemeCount(''), 0);
});

test('parseIssue extracts fields and strips @ from the author handle', () => {
    const body = [
        `### ${ISSUE_LABELS.oci}`,
        '',
        'ghcr.io/jane/ferris:1.0.0',
        '',
        `### ${ISSUE_LABELS.author}`,
        '',
        '@jane',
        '',
        `### ${ISSUE_LABELS.blurb}`,
        '',
        'A reputation-aware gardener.',
        '',
    ].join('\n');
    const { value, errors } = parseIssue(body);
    assert.deepEqual(errors, []);
    assert.equal(value.oci, 'ghcr.io/jane/ferris:1.0.0');
    assert.equal(value.author, 'jane');
    assert.equal(value.blurb, 'A reputation-aware gardener.');
});

test('parseIssue reports missing and _No response_ fields', () => {
    const body = [
        `### ${ISSUE_LABELS.oci}`,
        '',
        '_No response_',
        '',
        `### ${ISSUE_LABELS.author}`,
        '',
        '@jane',
        '',
    ].join('\n');
    const { value, errors } = parseIssue(body);
    assert.equal(value.author, 'jane');
    assert.ok(errors.some((e) => e.includes(ISSUE_LABELS.oci)));
    assert.ok(errors.some((e) => e.includes(ISSUE_LABELS.blurb)));
});

test('isValidIconUrl requires https', () => {
    assert.ok(isValidIconUrl('https://example.com/a.png'));
    assert.ok(!isValidIconUrl('http://example.com/a.png'));
    assert.ok(!isValidIconUrl('ftp://example.com/a.png'));
    assert.ok(!isValidIconUrl('not a url'));
});
