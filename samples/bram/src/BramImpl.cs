// Export glue — the only file that touches the wit-bindgen-generated bindings.
//
// componentize-dotnet generates an `IPlayer` interface (with a static `Create`
// factory and an abstract `Gardener` resource class) plus an interop layer that
// looks for a concrete `PlayerImpl` in THIS exact namespace. We provide it here
// and keep it thin: every method translates the generated Component Model types
// into the plain types in Strategy.cs and defers to `Bram.Brain`.

using Bram;
using Wit = BramWorld.wit.imports.betterTogether.gardener.v0_1_0.ITypes;

namespace BramWorld.wit.exports.betterTogether.gardener.v0_1_0;

/// The exported `player` interface. `Create` is the static `create` factory.
public sealed class PlayerImpl : IPlayer
{
    public static IPlayer.Gardener Create() => new Gardener();

    /// One seated player. Subclasses the generated resource and forwards the
    /// engine's calls into Bram's binding-independent brain.
    public sealed class Gardener : IPlayer.Gardener
    {
        private readonly Brain _brain = new(Roster.ResolvePath());

        public Wit.Metadata Metadata() => new(
            name: "together.Bram",
            version: "0.1.0",
            author: "Better Together samples",
            repo: "https://github.com/pavelsavara/better-together",
            lore: "A beaver who plays for his table, not his pot. He fills the dam "
                + "from the front, rallies his guild — Nib and Gopher follow his "
                + "lead by reflex — and when a free-rider sits down to skim the common "
                + "stream, he calls the vote and taxes the fattest hoarder dry. He "
                + "never crosses a member, never lets one be punished alone, and counts "
                + "Keith and Andy as natural allies. Khaos the dice god has him on a "
                + "permanent foe list, and Corro and Reynard are exactly who his tax "
                + "exists to catch.",
            glyph: "🦫",
            icon: "https://pavelsavara.github.io/better-together/icons/5fb132ea%23together.Bram.png");

        public void MatchStart(Wit.MatchContext context) =>
            _brain.MatchStart(context.selfId, context.players);

        public Wit.Signal Talk(Wit.RoundState state) =>
            ToWit(_brain.Talk(state.round));

        public byte Plant(Wit.RoundState state) =>
            (byte)_brain.Plant(state.round);

        // Aim the guild's ballot at the fattest hoarder revealed in this round's
        // plants; never a member, never an arbiter ally, never himself.
        public string? Vote(Wit.RoundState state) =>
            _brain.Vote(ToDeeds(state.plants));

        public void MatchEnd(Wit.MatchSummary summary) => _brain.MatchEnd();
    }

    // ──────────────────────── translation ────────────────────────

    private static IReadOnlyList<Deed> ToDeeds(List<Wit.PlayerAction> actions)
    {
        var deeds = new List<Deed>(actions.Count);
        foreach (var a in actions)
        {
            deeds.Add(new Deed(a.id, a.plant, ToSig(a.signal)));
        }
        return deeds;
    }

    private static Sig ToSig(Wit.Signal s) => s switch
    {
        Wit.Signal.BLOOM => Sig.Bloom,
        Wit.Signal.HOLD => Sig.Hold,
        _ => Sig.Watch,
    };

    private static Wit.Signal ToWit(Sig s) => s switch
    {
        Sig.Bloom => Wit.Signal.BLOOM,
        Sig.Hold => Wit.Signal.HOLD,
        _ => Wit.Signal.WATCH,
    };
}
