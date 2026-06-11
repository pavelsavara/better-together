import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './theme.css';
import { App } from './App.tsx';
import { StoreProvider } from './data/store.tsx';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <HashRouter>
            <StoreProvider>
                <App />
            </StoreProvider>
        </HashRouter>
    </StrictMode>,
);
