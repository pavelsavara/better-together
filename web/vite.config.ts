import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

// jsco's index.js doubles as a CLI and starts with a `#!/usr/bin/env node`
// shebang that rollup can't parse. Strip a leading shebang from bundled modules.
function stripShebang(): Plugin {
    return {
        name: 'strip-shebang',
        enforce: 'pre',
        transform(code: string) {
            if (code.startsWith('#!')) {
                return { code: code.replace(/^#![^\n]*\n/, '\n'), map: null };
            }
            return null;
        },
    };
}

// The data store (data/, wasm/, icons/, vfs/, matches/) is NOT part of the SPA
// bundle — in production it lives at the gh-pages branch root, written by the
// validation/tournament workflows and served alongside the SPA. The local
// equivalent of that root is the repo's gh-pages/ checkout (where run-local.ts
// publishes). Serve those store paths from there in dev + preview so the local
// site mirrors the deployed one exactly, with no duplicated fixture to drift.
const STORE_DIR = resolve(fileURLToPath(new URL('../gh-pages', import.meta.url)));
const STORE_PREFIXES = ['data/', 'wasm/', 'icons/', 'vfs/', 'matches/'];
const MIME: Record<string, string> = {
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
};

function serveStore(): Plugin {
    let base = '/';
    const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        let url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        if (base !== '/' && url.startsWith(base)) url = '/' + url.slice(base.length);
        const rel = url.replace(/^\/+/, '');
        if (!STORE_PREFIXES.some((p) => rel.startsWith(p))) return next();
        // Resolve and confine to STORE_DIR (block path-traversal via ../).
        const filePath = resolve(join(STORE_DIR, rel));
        if (filePath !== STORE_DIR && !filePath.startsWith(STORE_DIR + sep)) return next();
        try {
            if (!statSync(filePath).isFile()) return next();
        } catch {
            return next();
        }
        res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
        createReadStream(filePath).pipe(res);
    };
    return {
        name: 'serve-gh-pages-store',
        configResolved(config) {
            base = config.base || '/';
        },
        configureServer(server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server) {
            server.middlewares.use(handler);
        },
    };
}

// Relative base so the SPA works from a GitHub Pages project subpath.
export default defineConfig({
    base: './',
    plugins: [stripShebang(), serveStore(), react()],
    build: {
        rollupOptions: {
            // jsco picks its host at runtime via dynamic import(); the browser
            // takes the wasip3.js / wasip2-via-wasip3.js branches. Externalize the
            // Node-only host chunks (and node: builtins) so rollup doesn't try to
            // bundle their node:http / node:async_hooks imports for the browser.
            external: (id) =>
                /wasip3-node\.js$/.test(id) ||
                /wasip2-via-wasip3-node\.js$/.test(id) ||
                id.startsWith('node:'),
        },
    },
});
