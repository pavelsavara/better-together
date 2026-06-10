// Global data provider: fetch + cache data/index.json and data/scores.json once
// (architecture §5). Everything the SPA reads is same-origin static JSON.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { RegistryIndex, Scores } from './types.ts';

export interface StoreData {
    index: RegistryIndex | null;
    scores: Scores | null;
    loading: boolean;
    error: string | null;
}

const StoreContext = createContext<StoreData>({ index: null, scores: null, loading: true, error: null });

async function fetchJson<T>(url: string): Promise<T | null> {
    const res = await fetch(url);
    if (res.status === 404) return null; // optional file (e.g. scores before first run)
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return (await res.json()) as T;
}

export function StoreProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<StoreData>({ index: null, scores: null, loading: true, error: null });

    useEffect(() => {
        const base = import.meta.env.BASE_URL;
        let cancelled = false;
        (async () => {
            try {
                const [index, scores] = await Promise.all([
                    fetchJson<RegistryIndex>(`${base}data/index.json`),
                    fetchJson<Scores>(`${base}data/scores.json`),
                ]);
                if (!cancelled) setData({ index, scores, loading: false, error: null });
            } catch (e) {
                if (!cancelled) setData({ index: null, scores: null, loading: false, error: (e as Error).message });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return <StoreContext.Provider value={data}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreData {
    return useContext(StoreContext);
}

/** Find a bot record by its manufactured id. */
export function useBot(id: string | undefined) {
    const { index } = useStore();
    return id ? (index?.bots.find((b) => b.id === id) ?? null) : null;
}
