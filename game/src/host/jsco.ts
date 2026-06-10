// jsco resolution + the gardener capability whitelist.
//
// jsco is consumed from the package dependency by default (game/package.json
// pins `@pavelsavara/jsco` at `file:../../jsco/dist/debug`). Set the JSCO_DIST
// env var (or pass --jsco=<name>) to load a named sibling build instead
// (../../jsco/dist/<name>), mirroring tests/lib/harness.mjs so the engine and the
// integration suite agree on which runtime they exercise.

/** A minimal structural view of the jsco HostConfig we pass through. */
export interface JscoHostConfig {
    fs?: Map<string, Uint8Array | string>;
    stdout?: WritableStream;
    stderr?: WritableStream;
    env?: Array<[string, string]>;
    enabledInterfaces?: string[];
    limits?: { maxVfsBytes?: number; [k: string]: unknown };
    network?: unknown;
    [k: string]: unknown;
}

/** A jsco component instance (only the bits the host uses). */
export interface JscoInstance {
    exports: Record<string, Record<string, unknown>>;
    dispose(): void;
}

export type InstantiateWasiComponent = (bytes: Uint8Array, config: JscoHostConfig) => Promise<JscoInstance>;

/**
 * The default capability whitelist: everything the gardener world needs, minus
 * the network. Omitting wasi:sockets and wasi:http denies those capabilities, so
 * a bot cannot reach the network from CI or the browser (architecture §6).
 */
export const DEFAULT_ENABLED: readonly string[] = [
    'wasi:cli',
    'wasi:io',
    'wasi:filesystem',
    'wasi:clocks',
    'wasi:random',
    'better-together:gardener',
];

function selectedJscoDist(): string | null {
    const arg = process.argv.find((a) => a.startsWith('--jsco='));
    if (arg) return arg.slice('--jsco='.length);
    return process.env.JSCO_DIST ?? null;
}

let cached: Promise<InstantiateWasiComponent> | null = null;

/** Resolve `instantiateWasiComponent` from the selected jsco build (cached). */
export function getInstantiate(): Promise<InstantiateWasiComponent> {
    if (cached) return cached;
    const dist = selectedJscoDist();
    cached = (async () => {
        const mod = dist
            // game/src/host -> game/src -> game -> better-together -> <parent> -> jsco
            ? await import(new URL(`../../../../jsco/dist/${dist}/index.js`, import.meta.url).href)
            : await import('@pavelsavara/jsco');
        const fn = mod.instantiateWasiComponent as InstantiateWasiComponent | undefined;
        if (typeof fn !== 'function') {
            throw new Error('jsco: instantiateWasiComponent export not found');
        }
        return fn;
    })();
    return cached;
}

/** Unwrap a jsco Result variant: returns val on ok, throws on err. */
export function unwrapResult<T = unknown>(result: unknown, what = 'call'): T {
    if (result == null || typeof result !== 'object' || !('tag' in result)) {
        return result as T;
    }
    const r = result as { tag: string; val?: unknown };
    if (r.tag === 'ok') return r.val as T;
    const err = r.val;
    const detail = err === undefined ? '' : `: ${typeof err === 'string' ? err : JSON.stringify(err)}`;
    throw new Error(`${what} returned err${detail}`);
}
