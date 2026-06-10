// Guild-boss flavor text. Pure side-effects on stdout/stderr — never affects the
// decision. Kept separate so the strategy stays clean.

namespace Bram;

internal static class Banter
{
    internal static void Talk(int round, int plant, Sig sig, bool guildSeated)
    {
        string crowd = guildSeated ? "Guild, on me!" : "Anchors away.";
        Console.WriteLine($"[bram] round {round}: {crowd} I'll lead with {plant} seeds ({sig.ToString().ToUpperInvariant()}) — fill the dam.");
    }

    internal static void Plant(int round, int plant, bool guildSeated)
    {
        string note = guildSeated ? "keep the bloc's payout high" : "lead from the front";
        Console.WriteLine($"[bram] round {round}: planting {plant} to {note}.");
    }

    internal static void Vote(string target, int kept)
    {
        Console.WriteLine($"[bram] vote: tax {target} — fattest hoarder with {kept} kept. The dam takes it back.");
    }

    internal static void Abstain()
    {
        Console.WriteLine("[bram] vote: no hoarder worth taxing — the guild abstains.");
    }

    internal static void MatchEnd(int memberCount, int taxedCount)
    {
        Console.WriteLine($"[bram] dam's full for the night — {memberCount} member(s) on the roster, {taxedCount} free-rider(s) in the ledger.");
    }
}
