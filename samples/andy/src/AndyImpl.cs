// Export glue — the only file that touches the wit-bindgen-generated bindings.
//
// componentize-dotnet generates an `IPlayer` interface (with a static `Create`
// factory and an abstract `Gardener` resource class) plus an interop layer that
// looks for a concrete `PlayerImpl` in THIS exact namespace. We provide it here
// and keep it thin: every method translates the generated Component Model types
// into the plain types in Strategy.cs and defers to `Andy.Brain`.

using Andy;
using Wit = AndyWorld.wit.imports.betterTogether.gardener.v0_1_0.ITypes;

namespace AndyWorld.wit.exports.betterTogether.gardener.v0_1_0;

/// The exported `player` interface. `Create` is the static `create` factory.
public sealed class PlayerImpl : IPlayer
{
    public static IPlayer.Gardener Create() => new Gardener();

    /// One seated player. Subclasses the generated resource and forwards the
    /// engine's calls into Andy's binding-independent brain.
    public sealed class Gardener : IPlayer.Gardener
    {
        private readonly Brain _brain = new(FriendBook.ResolvePath());

        public Wit.Metadata Metadata() => new(
            name: "together.Andy",
            version: "0.1.0",
            author: "Better Together samples",
            repo: "https://github.com/pavelsavara/better-together",
            lore: "A hedgehog who plants by night. Warm and soft-bellied to friends "
                + "he remembers across many gardens, but he curls into his spines the "
                + "moment a neighbour turns stingy — then uncurls and forgives by dawn. "
                + "He warms to Bram the beaver's honest guild and keeps his spines half-up "
                + "around Reynard the fox, whose smile never quite reaches his ledger.",
            glyph: "🦔",
            icon: null);

        public void MatchStart(Wit.MatchContext context) =>
            _brain.MatchStart(context.selfId);

        public Wit.Signal Talk(Wit.RoundState state) =>
            ToWit(_brain.Talk(state.round, ToRounds(state.history)));

        public byte Plant(Wit.RoundState state) =>
            (byte)_brain.Plant(state.round, ToRounds(state.history));

        // Andy forgives by dawn: he never names a neighbour to tax, always abstaining.
        public string? Vote(Wit.RoundState state) => null;

        public void MatchEnd(Wit.MatchSummary summary) => _brain.MatchEnd();
    }

    // ──────────────────────── translation ────────────────────────

    private static IReadOnlyList<Round> ToRounds(List<Wit.RoundResult> history)
    {
        var rounds = new List<Round>(history.Count);
        foreach (var r in history)
        {
            var deeds = new List<Deed>(r.actions.Count);
            foreach (var a in r.actions)
            {
                deeds.Add(new Deed(a.id, a.plant, ToSig(a.signal)));
            }
            rounds.Add(new Round(deeds));
        }
        return rounds;
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
