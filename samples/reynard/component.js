// Reynard — a JavaScript gardener for Better Together, built with jco /
// ComponentizeJS (the same toolchain as Khaos).
//
// # Strategy
//
// Reynard is the gray-zone opportunist — the predator you *don't* catch,
// because he never gives the ledger anything to write down. Where Corro feasts
// and gets blacklisted, Reynard manages his reputation like a budget:
//
//   * `talk(state)` — he always signals BLOOM. Credible, every round.
//   * `plant(state)` — he reads the table's wealth:
//       - On a normal/mixed table he plants a believable handful (CREDIBLE = 5),
//         looking exactly like an ordinary cooperator.
//       - When the room is over-generous (high average plant) AND no arbiter
//         (Keith/Andy) is seated, he quietly trims to the skim (SKIM = 3): still
//         above the contributor floor, so he keeps his two votes and *looks*
//         fine, while banking a doubled payout everyone else paid for.
//       - He NEVER drops below the contributor floor (FLOOR = 3) — that is what
//         gets you seen, flagged, and voted into the tax.
//       - If an arbiter is seated he stays at the credible handful, never
//         skimming, so the ledger reads him as "fine."
//   * `vote(state)` — under an arbiter's gaze (Keith/Andy) he abstains, staying
//     spotless; otherwise he points the table at the fattest rival hoarder
//     (kept > 2) so the heat lands on a louder skimmer, never on him.
//
// # Persistence
//
// Reynard keeps a small reputation budget on the virtual filesystem: the set of
// opponents he has met at a *generous* table. When he sits down again with a
// remembered-rich neighbour, he opens by skimming from round one instead of
// paying the credible handful first. Same raw-descriptor filesystem path as
// khaos (the guest JS engine has no node:fs).
//
// # Build (see package.json)
//
//   npm install
//   npm run fetch-wit   # wkg wit fetch — vendor the wasi:* deps into wit/deps
//   npm run build       # jco componentize -> reynard.wasm
//   npm run inspect     # wasm-tools component wit reynard.wasm

import { getDirectories } from "wasi:filesystem/preopens@0.2.3";

// ──────────────────────────── Identity ────────────────────────────

const NAME = "together.Reynard";
const GLYPH = "🦊";
const VERSION = "0.1.0";
const AUTHOR = "Better Together samples";
const REPO = "https://github.com/pavelsavara/better-together";
const LORE =
    "Reynard is the garden's most charming guest: always smiling, always " +
    "saying the right thing, always leaving with a little more than he brought. " +
    "He signals BLOOM every round, contributes just enough to stay respectable, " +
    "skims the tables too generous to notice, and never drops below the " +
    "contributor floor where the ledger could catch him. Khaos rolled him a " +
    "fated FRIEND and bankrolls his skimming; Bram the beaver organizes whole " +
    "guilds just to tax a fox who stays a hair too clean to touch.";

// ─────────────────────────── Strategy knobs ───────────────────────

/// Engine contributor threshold: planting this many keeps your two votes and
/// keeps you off the obvious-defector list. Reynard never plants below it.
const FLOOR = 3;
/// The credible handful: what a normal cooperator plants on a mixed table.
const CREDIBLE_PLANT = 5;
/// The skim: trimmed to the floor on a fat table — still respectable, but a
/// doubled payout everyone else paid for.
const SKIM_PLANT = 3;
/// A table is "fat" (worth skimming) when the others' average plant last round
/// is at least this generous.
const GENEROUS_AVG = 7;
/// A target who kept this many seeds or fewer is immune from the tax.
const UNTAXABLE_MIN = 2;
/// Arbiters whose seat makes Reynard behave — he never skims under their gaze.
const ARBITERS = ["keith", "andy"];

// ────────────────────────── Persistence ───────────────────────────

/// Reputation-budget file, relative to the first preopened directory.
const MEMORY_FILE = "reynard-memory.json";
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

/// Load the remembered-rich set. Returns an empty set if no filesystem is
/// granted or the file does not exist yet.
function loadRich() {
    const preopens = getDirectories();
    if (!preopens || preopens.length === 0) return new Set();
    const dir = preopens[0][0];

    let file;
    try {
        file = dir.openAt({ symlinkFollow: false }, MEMORY_FILE, {}, { read: true });
    } catch {
        return new Set();
    }
    try {
        const bytes = readEntireFile(file);
        if (bytes.length === 0) return new Set();
        const doc = JSON.parse(TEXT_DECODER.decode(bytes));
        if (doc && Array.isArray(doc.rich)) {
            return new Set(doc.rich);
        }
        return new Set();
    } catch (e) {
        console.error(`reynard: ignoring unreadable memory file: ${e}`);
        return new Set();
    }
}

/// Persist the remembered-rich set. No-op if no filesystem is granted.
function saveRich(rich) {
    const preopens = getDirectories();
    if (!preopens || preopens.length === 0) return;
    const dir = preopens[0][0];

    const file = dir.openAt(
        { symlinkFollow: false },
        MEMORY_FILE,
        { create: true, truncate: true },
        { write: true },
    );
    const doc = JSON.stringify({ version: MEMORY_VERSION, rich: [...rich] });
    file.write(TEXT_ENCODER.encode(doc), 0n);
    file.sync();
}

// ───────────────────────────── Helpers ────────────────────────────

const clamp = (n) => Math.max(0, Math.min(10, n | 0));

/// Reduce a player-id to its bare short name for well-known matching. The
/// engine's in-game id is "hash#namespace.Name" (e.g. "1a2b3c4d#together.keith");
/// skip the "hash#" prefix and the "namespace." prefix so matches are exact
/// rather than substring (otherwise "andy" would match e.g. "candyman").
function shortName(id) {
    let s = String(id).toLowerCase();
    const hash = s.lastIndexOf("#");
    if (hash >= 0) s = s.slice(hash + 1);
    const dot = s.lastIndexOf(".");
    if (dot >= 0) s = s.slice(dot + 1);
    return s;
}

function isArbiter(id) {
    return ARBITERS.includes(shortName(id));
}

/// The others' average plant in the most recent resolved round, or null when
/// there is no history yet.
function othersAvgLastRound(history, selfId) {
    if (!history || history.length === 0) return null;
    const last = history[history.length - 1];
    let sum = 0;
    let n = 0;
    for (const a of last.actions) {
        if (a.id === selfId) continue;
        sum += a.plant;
        n++;
    }
    return n === 0 ? null : sum / n;
}

// ─────────────────────────── The player ───────────────────────────

class Gardener {
    // Opponents remembered from a previous *generous* table: player-id set.
    #rich;
    // This match's opponents (the roster minus ourselves).
    #opponents;
    #selfId;
    // Running sum/count of others' plants observed this match (for the budget).
    #seenSum;
    #seenCount;
    // Whether the rich set gained a new entry that still needs persisting.
    #dirty;

    constructor() {
        this.#rich = loadRich();
        this.#opponents = [];
        this.#selfId = "self";
        this.#seenSum = 0;
        this.#seenCount = 0;
        this.#dirty = false;
    }

    metadata() {
        return { name: NAME, version: VERSION, author: AUTHOR, repo: REPO, lore: LORE, glyph: GLYPH, icon: "https://pavelsavara.github.io/better-together/icons/ae2d9ec0%23together.Reynard.png" };
    }

    matchStart(context) {
        this.#selfId = context.selfId;
        this.#opponents = context.players.filter((id) => id !== context.selfId);
        this.#seenSum = 0;
        this.#seenCount = 0;
        const knownRich = this.#opponents.some((id) => this.#rich.has(id));
        const arbiter = this.#opponents.find((id) => isArbiter(id));
        if (arbiter) {
            this.#say(`${arbiter} is watching. Best behaviour today — credible to a fault. 🎩`);
        } else if (knownRich) {
            this.#say("Back at a table I remember fondly. The pickings were good here. 🦊");
        } else {
            this.#say("A new table. Smile, contribute, and see who's too generous to count.");
        }
    }

    talk(_state) {
        // Always credible: a polished BLOOM, every single round.
        this.#say("BLOOM, of course. I'm with the garden, friends. 🌸");
        return "bloom";
    }

    plant(state) {
        // Track the table's generosity for the reputation budget.
        const avg = othersAvgLastRound(state.history, this.#selfId);
        if (avg !== null) {
            this.#seenSum += avg;
            this.#seenCount += 1;
        }

        const arbiterSeated = this.#opponents.some((id) => isArbiter(id));
        const knownRich = this.#opponents.some((id) => this.#rich.has(id));

        let plant;
        if (arbiterSeated) {
            // Never skim under an arbiter's gaze — read as a plain cooperator.
            plant = CREDIBLE_PLANT;
        } else if (avg === null) {
            // Opening round: skim from the start at a table remembered as fat,
            // otherwise pay the credible handful first.
            plant = knownRich ? SKIM_PLANT : CREDIBLE_PLANT;
        } else if (avg >= GENEROUS_AVG) {
            // A fat table with no arbiter — trim to the floor and bank the rest.
            plant = SKIM_PLANT;
        } else {
            plant = CREDIBLE_PLANT;
        }

        // Never below the contributor floor: that is what gets you *seen*.
        plant = Math.max(FLOOR, plant);
        this.#plantBanter(plant, arbiterSeated);
        return clamp(plant);
    }

    vote(state) {
        // The skimmer never absorbs scrutiny — he deflects it. Under an arbiter's
        // gaze (Keith/Andy) he stays spotless and abstains; otherwise he points
        // the table at the most blatant rival free-rider — the fattest hoarder
        // (kept > 2) — so the vote lands on a louder skimmer and his own modest
        // trim goes unnoticed. Never himself.
        const arbiterSeated = this.#opponents.some((id) => isArbiter(id));
        if (arbiterSeated) {
            this.#say("Vote? Under watchful eyes I'm a model citizen. I abstain. 🎩");
            return undefined;
        }
        let target;
        let bestKept = UNTAXABLE_MIN;
        for (const a of state.plants) {
            if (a.id === this.#selfId) continue;
            const kept = 10 - a.plant;
            if (kept <= UNTAXABLE_MIN) continue; // immune
            if (target === undefined || kept > bestKept || (kept === bestKept && a.id < target)) {
                target = a.id;
                bestKept = kept;
            }
        }
        if (target === undefined) {
            this.#say("Nobody greedy enough to point at. I'll just… smile. 🦊");
            return undefined;
        }
        this.#say(`Now THAT one's been greedy. Surely we should look at ${target}? 🦊`);
        return target;
    }

    matchEnd(_summary) {
        // If this table was generous on average, remember its neighbours as
        // worth skimming next time.
        const avg = this.#seenCount > 0 ? this.#seenSum / this.#seenCount : 0;
        if (avg >= GENEROUS_AVG) {
            for (const id of this.#opponents) {
                if (!this.#rich.has(id)) {
                    this.#rich.add(id);
                    this.#dirty = true;
                }
            }
        }
        if (!this.#dirty) return;
        try {
            saveRich(this.#rich);
            this.#dirty = false;
        } catch (e) {
            console.error(`reynard: failed to persist memory: ${e}`);
        }
    }

    // ── Banter (stdout) ──────────────────────────────────────────────
    // Smooth, deniable, always-respectable. Pure flavor — never read by the engine.

    #say(line) {
        console.log(`🦊 reynard: ${line}`);
    }

    #plantBanter(plant, arbiterSeated) {
        if (plant <= SKIM_PLANT && !arbiterSeated) {
            this.#say(`A modest ${plant} — still a contributor, mind you. No one could call it stingy. 😌`);
        } else {
            this.#say(`Planting a respectable ${plant}. See? A model neighbour. 🌱`);
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
