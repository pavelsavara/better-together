// Read-model types for the SPA, re-exported from the engine's contracts so the
// UI and the engine never drift. The web app only ever READS these.
export type { RegistryIndex, BotRecord, Scores, ScoreRow, BotStatus } from '../../../game/src/types.ts';
export type {
    Signal,
    SignalBroadcast,
    PlayerAction,
    RoundOutcome,
    RoundResult,
    Metadata,
} from '../../../game/src/types.ts';
