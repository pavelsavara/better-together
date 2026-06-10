// Hedgehog flavor text. Pure side-effects on stdout/stderr — never affects the
// decision. Kept separate so the strategy stays clean.

namespace Andy;

internal static class Banter
{
    internal static void Talk(int round, int plant, Sig sig, bool wary)
    {
        string mood = wary ? "spines half-raised" : "snuffling about";
        Console.WriteLine($"[andy] round {round}: {mood}, I mean to tuck in {plant} seeds ({sig.ToString().ToUpperInvariant()}).");
    }

    internal static void Plant(int round, int plant)
    {
        Console.WriteLine($"[andy] round {round}: padding out to plant {plant}. Deeds, not words.");
    }

    internal static void Vote(int round, string target, int defections)
    {
        Console.WriteLine($"[andy] round {round}: spines out at last — {target} skimmed {defections} times and won't stop. I name them.");
    }

    internal static void Abstain(int round)
    {
        Console.WriteLine($"[andy] round {round}: no grudge worth a vote tonight — I abstain and forgive.");
    }

    internal static void MatchEnd(int friendCount)
    {
        Console.WriteLine($"[andy] curling up for the night — {friendCount} friend(s) in the burrow book.");
    }
}
