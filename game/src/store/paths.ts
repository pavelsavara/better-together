// Filesystem layout of the gh-pages store (docs/architecture.md §2). All paths
// are resolved against a base directory so tests can point the store at a temp
// dir and CI at the checked-out gh-pages branch.

import { join } from 'node:path';

export function dataDir(base: string): string {
    return join(base, 'data');
}
export function indexPath(base: string): string {
    return join(base, 'data', 'index.json');
}
export function scoresPath(base: string): string {
    return join(base, 'data', 'scores.json');
}
export function registryStatePath(base: string): string {
    return join(base, 'data', 'registry-state.json');
}
export function metaPath(base: string): string {
    return join(base, 'data', 'meta.json');
}
export function wasmPath(base: string, botId: string, version: string): string {
    return join(base, 'wasm', botId, `${version}.wasm`);
}
export function iconPath(base: string, botId: string): string {
    return join(base, 'icons', `${botId}.png`);
}
export function vfsDir(base: string, botId: string): string {
    return join(base, 'vfs', botId);
}
export function matchesDir(base: string): string {
    return join(base, 'matches');
}

/**
 * The dated directory for a run's match logs: matches/YYYY/MM/DD/<runId>.
 * The date is derived from `when` (defaults to now) in UTC.
 */
export function matchRunDir(base: string, runId: string, when = new Date()): string {
    const yyyy = String(when.getUTCFullYear());
    const mm = String(when.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(when.getUTCDate()).padStart(2, '0');
    return join(matchesDir(base), yyyy, mm, dd, runId);
}

export function matchLogPath(base: string, runId: string, matchId: string, when = new Date()): string {
    // matchId may contain ':' (an ISO timestamp); keep only filename-safe chars.
    const safe = matchId.replace(/[^a-zA-Z0-9._-]/g, '-');
    return join(matchRunDir(base, runId, when), `${safe}.json`);
}
