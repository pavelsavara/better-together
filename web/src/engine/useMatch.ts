import { useCallback, useEffect, useRef, useState } from 'react';
import { MatchController, type MatchView, type SeatEntry } from './controller.ts';
import type { BotRecord } from '../data/types.ts';

/** React wrapper around MatchController: exposes the view + control methods. */
export function useMatch() {
    const [view, setView] = useState<MatchView>(() => new MatchController(() => {}).view);
    const ref = useRef<MatchController | null>(null);

    if (!ref.current) {
        ref.current = new MatchController(setView);
    }

    useEffect(() => {
        const controller = ref.current!;
        return () => controller.dispose();
    }, []);

    const load = useCallback((bots: BotRecord[], seed: string, baseUrl: string) => {
        return ref.current!.load(bots, seed, baseUrl);
    }, []);
    const loadEntries = useCallback((entries: SeatEntry[], seed: string) => {
        return ref.current!.loadEntries(entries, seed);
    }, []);
    const step = useCallback(() => ref.current!.step(), []);
    const play = useCallback((delayMs: number) => ref.current!.play(delayMs), []);
    const pause = useCallback(() => ref.current!.pause(), []);

    return { view, load, loadEntries, step, play, pause };
}
