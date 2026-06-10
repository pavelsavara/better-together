import type { BotRecord } from '../data/types.ts';

/** A bot's avatar: the cached same-origin PNG, or its glyph in a frame. */
export function Avatar({ bot, src }: { bot: BotRecord; src?: string | null }) {
    if (src) {
        return <img className="avatar" src={src} alt={`${bot.name} avatar`} width={100} height={100} />;
    }
    return (
        <div className="avatar" role="img" aria-label={`${bot.name} glyph`}>
            {bot.glyph}
        </div>
    );
}
