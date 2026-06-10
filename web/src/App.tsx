import { NavLink, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home.tsx';
import { Scores } from './pages/Scores.tsx';
import { Bot } from './pages/Bot.tsx';
import { Submit } from './pages/Submit.tsx';
import { About } from './pages/About.tsx';
import { Rules } from './pages/Rules.tsx';

const NAV = [
    { to: '/', label: 'Home', end: true },
    { to: '/scores', label: 'Top Scores', end: false },
    { to: '/submit', label: 'Submit', end: false },
    { to: '/builder', label: 'Builder', end: false },
    { to: '/about', label: 'About', end: false },
    { to: '/rules', label: 'Rules', end: false },
];

export function App() {
    return (
        <div className="app">
            <header className="header">
                <span className="brand">🌱 Better Together</span>
                <nav className="nav">
                    {NAV.map((n) => (
                        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                            {n.label}
                        </NavLink>
                    ))}
                </nav>
            </header>
            <main className="content">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/scores" element={<Scores />} />
                    <Route path="/bot/:id" element={<Bot />} />
                    <Route path="/submit" element={<Submit />} />
                    <Route path="/builder" element={<Builder />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/rules" element={<Rules />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </main>
            <footer className="footer">
                <span>jsco · WASI · better-together</span>
                <span className="muted">“When you join a group, does it flourish?”</span>
            </footer>
        </div>
    );
}

function Builder() {
    return (
        <div className="panel">
            <h2>═══| BOT BUILDER |═══</h2>
            <p className="muted">The in-browser strategy editor arrives in a later phase.</p>
        </div>
    );
}

function NotFound() {
    return (
        <div className="panel">
            <h2>404</h2>
            <p className="muted">No such page.</p>
        </div>
    );
}
