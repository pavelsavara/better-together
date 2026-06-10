// Read layer for the gh-pages store (docs/architecture.md §2). Loads the index,
// scores, registry-state, meta, recent match logs, and per-bot VFS. Missing
// optional files return null / empty rather than throwing, so a fresh store
// reads cleanly; a present-but-malformed file throws via the schema validators.

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { RegistryIndex, Scores, RegistryState, TournamentMeta, MatchLog } from '../types.ts';
import type { Vfs } from '../host/vfs.ts';
import {
    parseRegistryIndex,
    parseScores,
    parseRegistryState,
    parseMeta,
    parseMatchLog,
    emptyRegistryIndex,
} from './schema.ts';
import {
    indexPath,
    scoresPath,
    registryStatePath,
    metaPath,
    matchesDir,
    vfsDir,
} from './paths.ts';

async function readTextIfExists(path: string): Promise<string | null> {
    try {
        return await readFile(path, 'utf8');
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
    }
}

/** Load index.json, or an empty registry when the store is fresh. */
export async function loadIndex(base: string): Promise<RegistryIndex> {
    const text = await readTextIfExists(indexPath(base));
    return text == null ? emptyRegistryIndex() : parseRegistryIndex(text);
}

/** Load scores.json, or null when it hasn't been computed yet. */
export async function loadScores(base: string): Promise<Scores | null> {
    const text = await readTextIfExists(scoresPath(base));
    return text == null ? null : parseScores(text);
}

/** Load registry-state.json, or null when the scheduler hasn't run yet. */
export async function loadRegistryState(base: string): Promise<RegistryState | null> {
    const text = await readTextIfExists(registryStatePath(base));
    return text == null ? null : parseRegistryState(text);
}

/** Load meta.json, or null when absent. */
export async function loadMeta(base: string): Promise<TournamentMeta | null> {
    const text = await readTextIfExists(metaPath(base));
    return text == null ? null : parseMeta(text);
}

async function readdirSafe(dir: string) {
    try {
        return await readdir(dir, { withFileTypes: true });
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw e;
    }
}

async function walkFiles(dir: string): Promise<string[]> {
    const entries = await readdirSafe(dir);
    const out: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walkFiles(full)));
        else if (entry.isFile()) out.push(full);
    }
    return out;
}

/**
 * Load recent match logs, newest first. Match logs sort lexicographically by
 * their dated path (YYYY/MM/DD/runId/matchId), so a reverse sort yields the most
 * recent. Pass a `limit` to cap how many are parsed.
 */
export async function loadRecentMatchLogs(base: string, limit = Infinity): Promise<MatchLog[]> {
    const files = (await walkFiles(matchesDir(base))).filter((f) => f.endsWith('.json'));
    files.sort().reverse();
    const slice = Number.isFinite(limit) ? files.slice(0, limit) : files;
    const logs: MatchLog[] = [];
    for (const file of slice) {
        const text = await readFile(file, 'utf8');
        logs.push(parseMatchLog(text));
    }
    return logs;
}

/** Load one bot's VFS as a Map keyed by POSIX-style relative paths. */
export async function loadVfs(base: string, botId: string): Promise<Vfs> {
    const dir = vfsDir(base, botId);
    const fs: Vfs = new Map();
    for (const file of await walkFiles(dir)) {
        const rel = relative(dir, file);
        if (rel.startsWith('..')) continue; // defensive: never surface a path outside the mount
        fs.set(rel.split(sep).join('/'), new Uint8Array(await readFile(file)));
    }
    return fs;
}

/** Load the VFS for many bots at once. */
export async function loadAllVfs(base: string, botIds: readonly string[]): Promise<Map<string, Vfs>> {
    const out = new Map<string, Vfs>();
    for (const id of botIds) out.set(id, await loadVfs(base, id));
    return out;
}
