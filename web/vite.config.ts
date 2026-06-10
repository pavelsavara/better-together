import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

// Relative base so the SPA works from a GitHub Pages project subpath.
export default defineConfig({
    base: './',
    plugins: [stripShebang(), react()],
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
