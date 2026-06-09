// Shared test harness for instantiating Better Together gardener samples with jsco.
//
// jsco runtime contract (verified against a real component, see README):
//   instance.exports['better-together:gardener/player@0.1.0'] exposes FREE functions:
//     create()                         -> { tag:'ok', val:<handle:int> } | { tag:'err', val? }
//     gardener-metadata(handle)        -> { tag:'ok', val: metadata }
//     gardener-match-start(handle,ctx) -> { tag:'ok' }
//     gardener-talk(handle,state)      -> { tag:'ok', val:'bloom'|'hold'|'watch' }
//     gardener-plant(handle,state)     -> { tag:'ok', val:<u8> }
//     gardener-match-end(handle,sum)   -> { tag:'ok' }
//   The resource handle is the FIRST argument; results are Result variants (never auto-unwrapped).
//   Record fields are camelCased (matchId, selfId, groupSize, roundsPlayed, ...).
//
// All samples are instantiated DIRECTLY (no multiplexer) with a mock in-memory fs,
// captured stdout/stderr, working random, and an enabledInterfaces whitelist that
// omits wasi:sockets and wasi:http.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instantiateWasiComponent } from '@pavelsavara/jsco';

const ROOT = new URL('../../', import.meta.url); // repo root (tests/lib -> repo)

// Where each sample's compiled .wasm may live: the sample dir first, then dist/.
const SAMPLE_WASM = {
    ferris: ['samples/ferris/target/wasm32-wasip2/release/ferris.wasm', 'dist/ferris.wasm'],
    corro: ['samples/corro/target/wasm32-wasip1/release/corro.wasm', 'dist/corro.wasm'],
    khaos: ['samples/khaos/khaos.wasm', 'dist/khaos.wasm'],
    gopher: ['samples/gopher/gopher.wasm', 'dist/gopher.wasm'],
    micro: ['samples/micro/micro.wasm', 'dist/micro.wasm'],
    keith: ['samples/keith/keith.wasm', 'dist/keith.wasm'],
    andy: ['samples/andy/bin/Release/net10.0/wasi-wasm/native/andy.wasm', 'dist/andy.wasm'],
    attacker: ['samples/attacker/target/wasm32-wasip2/release/attacker.wasm', 'dist/attacker.wasm'],
};

/** Resolve a sample's .wasm path. Returns { path, exists }. */
export function resolveSample(name) {
    const candidates = SAMPLE_WASM[name] ?? [`dist/${name}.wasm`];
    for (const rel of candidates) {
        const abs = fileURLToPath(new URL(rel, ROOT));
        if (existsSync(abs)) return { path: abs, exists: true };
    }
    const first = fileURLToPath(new URL(candidates[0], ROOT));
    return { path: first, exists: false };
}

/** Concatenate Uint8Array chunks into one. */
function concatChunks(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    return out;
}

/** Build a WritableStream that collects chunks into the given array. */
function captureStream(chunks) {
    return new WritableStream({
        write(chunk) {
            chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
        },
    });
}

// Default capability whitelist: everything the gardener world needs, minus
// the network. Omitting wasi:sockets and wasi:http denies those capabilities.
export const DEFAULT_ENABLED = [
    'wasi:cli',
    'wasi:io',
    'wasi:filesystem',
    'wasi:clocks',
    'wasi:random',
    'better-together:gardener',
];

/** Unwrap a jsco Result variant. Returns val on ok, throws on err. */
export function unwrap(result, what = 'call') {
    if (result == null || typeof result !== 'object' || !('tag' in result)) {
        // Some shapes (e.g. result<_> success) may already be undefined.
        return result;
    }
    if (result.tag === 'ok') return result.val;
    const err = result.val;
    const detail = err === undefined ? '' : `: ${typeof err === 'string' ? err : JSON.stringify(err)}`;
    throw new Error(`${what} returned err${detail}`);
}

/**
 * Instantiate a gardener sample and return a friendly wrapper.
 *
 * @param {string} name sample id (ferris, corro, khaos, gopher, micro, attacker)
 * @param {object} [opts]
 * @param {Map<string, Uint8Array|string>} [opts.fs] in-memory VFS (defaults to empty Map)
 * @param {[string,string][]} [opts.env] environment variables
 * @param {string[]} [opts.enabledInterfaces] capability whitelist (defaults to DEFAULT_ENABLED)
 * @param {object} [opts.limits] AllocationLimits (incl. assumed maxVfsBytes quota)
 * @param {object} [opts.network] network config (omit to keep network denied)
 * @param {object} [opts.config] extra HostConfig fields to merge
 * @returns {Promise<GardenerPlayer>}
 */
export async function loadGardener(name, opts = {}) {
    const { path, exists } = resolveSample(name);
    if (!exists) {
        const err = new Error(`sample "${name}" not built (missing ${path})`);
        err.code = 'SAMPLE_MISSING';
        throw err;
    }

    const bytes = new Uint8Array(await readFile(path));
    const stdoutChunks = [];
    const stderrChunks = [];

    const fs = opts.fs ?? new Map();
    const config = {
        fs,
        stdout: captureStream(stdoutChunks),
        stderr: captureStream(stderrChunks),
        env: opts.env ?? [],
        enabledInterfaces: opts.enabledInterfaces ?? DEFAULT_ENABLED,
        ...(opts.limits ? { limits: opts.limits } : {}),
        ...(opts.network ? { network: opts.network } : {}),
        ...(opts.config ?? {}),
    };

    const instance = await instantiateWasiComponent(bytes, config);
    const playerKey = Object.keys(instance.exports).find((k) => k.includes('gardener/player'));
    if (!playerKey) {
        instance.dispose();
        throw new Error(`sample "${name}" does not export gardener/player; exports: ${Object.keys(instance.exports).join(', ')}`);
    }
    const player = instance.exports[playerKey];

    const fn = (kebab) => {
        const f = player[kebab] ?? player[`[method]gardener.${kebab.replace(/^gardener-/, '')}`];
        if (typeof f !== 'function') {
            throw new Error(`sample "${name}" missing export "${kebab}"`);
        }
        return f;
    };

    return {
        name,
        path,
        instance,
        playerKey,
        rawPlayer: player,
        /** stdout captured so far as a decoded string */
        stdout: () => new TextDecoder().decode(concatChunks(stdoutChunks)),
        /** stderr captured so far as a decoded string */
        stderr: () => new TextDecoder().decode(concatChunks(stderrChunks)),
        /** the current in-memory VFS */
        fs,
        async create() {
            return unwrap(await fn('create')(), `${name}.create`);
        },
        async metadata(handle) {
            return unwrap(await fn('gardener-metadata')(handle), `${name}.metadata`);
        },
        async matchStart(handle, ctx) {
            return unwrap(await fn('gardener-match-start')(handle, ctx), `${name}.match-start`);
        },
        async talk(handle, state) {
            return unwrap(await fn('gardener-talk')(handle, state), `${name}.talk`);
        },
        async plant(handle, state) {
            return unwrap(await fn('gardener-plant')(handle, state), `${name}.plant`);
        },
        async matchEnd(handle, summary) {
            return unwrap(await fn('gardener-match-end')(handle, summary), `${name}.match-end`);
        },
        dispose() {
            instance.dispose();
        },
    };
}

/**
 * @typedef {Awaited<ReturnType<typeof loadGardener>>} GardenerPlayer
 */
