// Khaos — a JavaScript gardener for Better Together, built with jco /
// ComponentizeJS.
//
// # Strategy
//
// Khaos is Ferris's chaotic enemy. The first time he ever sees another player,
// he flips a weighted coin and decides — at random — whether they are a FRIEND
// (70%) or a FOE (30%). That verdict is then remembered *forever*, persisted as
// JSON on the virtual filesystem, so the same opponent is judged the same way in
// every future match.
//
// Each round runs in two phases:
//   * `talk(state)` — his broadcast `signal` is pure chaos: a fresh random pick
//     of {bloom, hold, watch} every single round, divorced from what he'll plant.
//   * `plant(state)` — he reads the table:
//       - If ANY remembered foe is seated, he keeps everything: plant 0.
//       - If the whole table is friends, he is fully generous: plant 10.
//
// Throughout, Khaos cackles on the **console** (stdout) — manic, fatalistic, and
// fond of blaming the dice. It's pure flavor; the engine never reads it.
//
// # Persistence
//
// The guest JS engine (StarlingMonkey) has no `node:fs`. Instead Khaos imports
// `wasi:filesystem/preopens` and calls the raw descriptor API, exactly like the
// official jco `fs-write-file` example. When the component is transpiled and run
// under Node via jco, jco's `preview2-shim` backs these calls with the real host
// filesystem.
//
// # Build (see package.json)
//
//   npm install
//   npm run fetch-wit   # wkg wit fetch — vendor the wasi:* deps into wit/deps
//   npm run build       # jco componentize -> khaos.wasm
//   npm run inspect     # wasm-tools component wit khaos.wasm

import { getDirectories } from "wasi:filesystem/preopens@0.2.3";

// ──────────────────────────── Identity ────────────────────────────

const NAME = "khaos";
const VERSION = "0.1.0";
const AUTHOR = "Better Together samples";
const REPO = "https://github.com/pavelsavara/better-together";
const LORE =
    "Khaos is the garden's coin-flip god — he meets you once, lets the dice " +
    "decide whether you are friend or foe, and then honours that verdict " +
    "forever with deranged conviction. His words are random, his grudges are " +
    "permanent, and he insists none of it is his fault: the dice made him do it. " +
    "Two names the dice never got to touch: Reynard the fox, his fated darling, " +
    "and Bram the beaver — guild boss, sworn foe, given nothing on sight.";

// ─────────────────────────── Strategy knobs ───────────────────────

/// Probability that a newly-seen player is judged a FRIEND (vs. a FOE).
const FRIEND_PROB = 0.7;
/// Verdicts the dice never get to decide, matched case-insensitively by id.
/// Reynard the fox flattered his way onto the eternal-friend list; Bram the
/// beaver — who organizes guild to punish foxes — earned eternal enmity.
const FATED_VERDICTS = { reynard: "friend", bram: "foe" };
/// Contribution when the whole table is friends — full generosity.
const FRIEND_PLANT = 10;
/// Contribution when any remembered foe is seated — keep everything.
const FOE_PLANT = 0;
/// The chaotic broadcast pool: one is picked at random every round.
const SIGNALS = ["bloom", "hold", "watch"];

// ────────────────────────── Persistence ───────────────────────────

/// Friend/foe verdict file, relative to the first preopened directory.
const MEMORY_FILE = "khaos-memory.json";
/// On-disk schema version.
const MEMORY_VERSION = 1;

// Created once at snapshot time, reused on every call.
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/// Read a file descriptor to its end, returning the raw bytes.
function readEntireFile(file) {
    const CHUNK = 64n * 1024n;
    const chunks = [];
    let offset = 0n;
    for (; ;) {
        const [bytes, eof] = file.read(CHUNK, offset);
        if (bytes.length > 0) {
            chunks.push(bytes);
            offset += BigInt(bytes.length);
        }
        if (eof || bytes.length === 0) break;
    }
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
        out.set(c, pos);
        pos += c.length;
    }
    return out;
}

/// Load the remembered friend/foe verdicts. Returns an empty map if no
/// filesystem is granted or the file does not exist yet.
function loadVerdicts() {
    const preopens = getDirectories();
    if (!preopens || preopens.length === 0) return {};
    const dir = preopens[0][0];

    let file;
    try {
        // Open read-only; throws (e.g. not-found) on the very first run.
        file = dir.openAt({ symlinkFollow: false }, MEMORY_FILE, {}, { read: true });
    } catch {
        return {};
    }
    try {
        const bytes = readEntireFile(file);
        if (bytes.length === 0) return {};
        const doc = JSON.parse(TEXT_DECODER.decode(bytes));
        if (doc && typeof doc.verdicts === "object" && doc.verdicts !== null) {
            return doc.verdicts;
        }
        return {};
    } catch (e) {
        console.error(`khaos: ignoring unreadable memory file: ${e}`);
        return {};
    }
}

/// Persist the friend/foe verdicts. No-op if no filesystem is granted.
function saveVerdicts(verdicts) {
    const preopens = getDirectories();
    if (!preopens || preopens.length === 0) return;
    const dir = preopens[0][0];

    const file = dir.openAt(
        { symlinkFollow: false },
        MEMORY_FILE,
        { create: true, truncate: true },
        { write: true },
    );
    const doc = JSON.stringify({ version: MEMORY_VERSION, verdicts });
    file.write(TEXT_ENCODER.encode(doc), 0n);
    file.sync();
}

// ─────────────────────────── The player ───────────────────────────

class Gardener {
    // Cross-match friend/foe verdicts: player-id -> "friend" | "foe".
    #verdicts;
    // This match's opponents (the roster minus ourselves).
    #opponents;
    // Whether #verdicts gained a new entry that still needs persisting.
    #dirty;

    constructor() {
        this.#verdicts = loadVerdicts();
        this.#opponents = [];
        this.#dirty = false;
    }

    metadata() {
        return { name: NAME, version: VERSION, author: AUTHOR, repo: REPO, lore: LORE };
    }

    matchStart(context) {
        this.#opponents = context.players.filter((id) => id !== context.selfId);
        for (const id of this.#opponents) {
            if (!Object.prototype.hasOwnProperty.call(this.#verdicts, id)) {
                // A fated name skips the dice; everyone else is rolled and then
                // remembered forever.
                const fated = FATED_VERDICTS[id.toLowerCase()];
                this.#verdicts[id] = fated ?? (Math.random() < FRIEND_PROB ? "friend" : "foe");
                this.#dirty = true;
                if (fated === "friend") {
                    this.#say(`${id}! The dice don't even get a vote — you are FATED a friend. 🦊🎲`);
                } else if (fated === "foe") {
                    this.#say(`${id}. No roll needed. The dice loathe a guild boss — FOE, forever. 🦫🚫`);
                } else {
                    this.#say(
                        `A new face: ${id}! *rolls dice* …the dice say ${this.#verdicts[id].toUpperCase()}. I'll remember this FOREVER. 🎲`,
                    );
                }
            }
        }
    }

    talk(_state) {
        const foe = this.#opponents.find((id) => this.#verdicts[id] === "foe");
        const friend = this.#opponents.find((id) => this.#verdicts[id] === "friend");
        this.#talkBanter(foe, friend);
        // Chaos: the signal is random every round, divorced from what we plant.
        return SIGNALS[Math.floor(Math.random() * SIGNALS.length)];
    }

    plant(_state) {
        const foe = this.#opponents.find((id) => this.#verdicts[id] === "foe");
        const plant = foe ? FOE_PLANT : FRIEND_PLANT;
        this.#plantBanter(foe, plant);
        return plant;
    }

    matchEnd(_summary) {
        if (!this.#dirty) return;
        try {
            saveVerdicts(this.#verdicts);
            this.#dirty = false;
        } catch (e) {
            console.error(`khaos: failed to persist memory: ${e}`);
        }
    }

    // ── Banter (stdout) ──────────────────────────────────────────────
    // Manic, fatalistic, dice-obsessed. Pure flavor — never read by the engine.

    #say(line) {
        console.log(`🎲 khaos: ${line}`);
    }

    #talkBanter(foe, friend) {
        const pool = [
            "BLOOM! Or HOLD! Or WATCH! I rolled for it, don't blame me. 🎲",
            "I flipped a coin to greet you. The coin lost.",
            "Signals are noise. I am noise. We are one. 🌪️",
            "Maybe I mean it this round. Maybe. Probably not.",
            "Order is a lie and so is this broadcast.",
        ];
        if (foe) {
            this.#say(`${foe}! The dice named you FOE long ago. I don't make the rules — I AM the dice.`);
        } else if (friend) {
            this.#say(`${friend}, my randomly-chosen beloved. The dice adore you today and forever.`);
        } else {
            this.#say(pool[Math.floor(Math.random() * pool.length)]);
        }
    }

    #plantBanter(foe, plant) {
        if (foe) {
            const pool = [
                `A foe at the table (${foe}) — I keep my seeds AND my secrets. 🙅`,
                `Nothing for you, ${foe}. The dice have spoken. Again. Forever.`,
                "Zero seeds. Chaos keeps everything when chaos remembers a grudge.",
            ];
            this.#say(pool[Math.floor(Math.random() * pool.length)]);
        } else {
            const pool = [
                `All friends?! Then I give EVERYTHING — ${plant} seeds of pure chaos-love! 🌪️`,
                "Order is a lie. Here are all my seeds. Or are they? (They are.)",
                "I planted on a whim. Don't read into it. There's nothing to read.",
            ];
            this.#say(pool[Math.floor(Math.random() * pool.length)]);
        }
    }
}

// jco maps the exported `better-together:gardener/player` interface to an object
// named `player`, holding the resource class (`Gardener`) and the freestanding
// `create` factory. Bare `result<T>` success returns `T`; an error would throw.
export const player = {
    Gardener,
    create() {
        return new Gardener();
    },
};
