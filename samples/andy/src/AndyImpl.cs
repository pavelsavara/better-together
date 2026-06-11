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
            lore: "Andy is the garden's gentle reciprocator, a soft-bellied hedgehog "
                + "who trusts by default and meets every new table belly-up, hoping for "
                + "the best. He is nice before he is anything else: he opens each match "
                + "soft, exposing himself in good faith and planting generously, because "
                + "he would rather risk being taken advantage of than start a quarrel he "
                + "did not need to have. But trust him as you would a hedgehog, not a "
                + "doormat. The moment a neighbour turns stingy he curls into a tight ball "
                + "of spines and pulls his seeds back toward himself, mirroring exactly the "
                + "coldness the table showed him. Prick him and he prickles back; warm him "
                + "and he unrolls again. What sets Andy apart is that he judges you by your "
                + "digging and never by your talk. Promises and posturing wash straight over "
                + "him; he watches only what hands actually put in the dirt, and he answers "
                + "deeds with deeds. He is also stubbornly forgiving, for a hedgehog cannot "
                + "stay curled up forever. Even against a cold and selfish table he will "
                + "periodically uncurl and offer one open-handed round, quietly testing "
                + "whether kindness can begin again, so he never sinks into the bitter, "
                + "permanent grudge that traps lesser players. He is warm and loyal to those "
                + "who have proven generous to him before, slow to forget a friend and quick "
                + "to bloom in good company, yet he carries no lasting spite. His temperament "
                + "is patient, even-handed, and durable: retaliatory enough to deter the "
                + "greedy, gracious enough to rebuild trust, and honest enough that his "
                + "raised spines are always a true warning and never a bluff.",
            glyph: "🦔",
            icon: "https://pavelsavara.github.io/better-together/icons/5efad061%23together.Andy.png");

        public void MatchStart(Wit.MatchContext context) =>
            _brain.MatchStart(context.selfId);

        public Wit.Signal Talk(Wit.RoundState state) =>
            ToWit(_brain.Talk(state.round, ToRounds(state.history)));

        public byte Plant(Wit.RoundState state) =>
            (byte)_brain.Plant(state.round, ToRounds(state.history));

        // Forgiveness stays primary: Andy only names a persistent, still-skimming
        // free-rider — never a guild member, never a remembered friend.
        public string? Vote(Wit.RoundState state) =>
            _brain.Vote(state.round, ToRounds(state.history), ToDeeds(state.plants));

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
