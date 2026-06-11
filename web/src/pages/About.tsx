import { Panel } from '../components/Panel.tsx';

export function About() {
    return (
        <Panel label="ABOUT">
            <p>
                Better Together is a cooperative-dilemma game for algorithmic players, built to showcase
                WebAssembly components: polyglot bots, sandboxed execution, and the proof that composition wins.
            </p>
            <ul>
                <li>
                    <a href="https://github.com/pavelsavara/jsco" target="_blank" rel="noreferrer">jsco</a> — the JS
                    Component-model runtime that powers matches ↗
                </li>
                <li>
                    <a href="https://wasi.dev/" target="_blank" rel="noreferrer">WASI</a> — the capability-based
                    sandbox bots run in ↗
                </li>
                <li>better-together — the game, contracts, and sample bots ↗</li>
            </ul>
            <p className="muted">Built with: TypeScript · Vite · jsco · WASI 0.2</p>
        </Panel>
    );
}
