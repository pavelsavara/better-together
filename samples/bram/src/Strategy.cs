// Bram's brain — pure, binding-independent strategy logic.
//
// This file deliberately depends on NOTHING that wit-bindgen generates. The
// generated export glue (BramImpl.cs) translates the Component Model records
// into the small plain types below and calls into `Brain`. Keeping the strategy
// here makes it trivial to reason about and immune to binding churn.
//
// Bram is the coalition organizer: he plants generously every round as the
// table's anchor, signals BLOOM honestly, recognizes his guild members
// (Micro, Gopher) and rallies the bloc, and aims the tax vote at the fattest
// hoarder — never at a member, never at an arbiter ally (Keith, Andy).

using System.Text.Json;
using System.Text.Json.Serialization;

namespace Bram;

/// The three cheap-talk broadcasts, mirrored from the WIT `signal` enum.
internal enum Sig
{
    Bloom,
    Hold,
    Watch,
}

/// What one player did in a round (a flattened `player-action`).
internal readonly record struct Deed(string Id, int Plant, Sig Signal);

/// A resolved round (a flattened `round-result`) — only the bits Bram reads.
internal readonly record struct Round(IReadOnlyList<Deed> Actions);

/// Bram's tunable knobs. Public consts so the README and tests can reference
/// the exact numbers.
internal static class Knobs
{
    /// Engine contributor threshold: a plant of this many seeds or more counts.
    internal const int Stake = 3;
    /// Every player keeps an untaxable minimum; a target who kept this many or
    /// fewer is immune, so there is no point aiming a ballot at them.
    internal const int UntaxableMin = 2;
    /// The generous anchor: Bram leads from the front every round.
    internal const int AnchorPlant = 9;
    /// When a guild member is seated, max out to keep the bloc's payout high.
    internal const int RallyPlant = 10;
    /// Honest signalling: BLOOM when the planned plant is at least this many
    /// (Bram's anchor is always well above it).
    internal const int BloomThreshold = 5;
}

/// The on-disk roster: the members Bram has rallied and the free-riders he has
/// taxed before. He remembers a skimmer across matches and aims at them first.
internal sealed class Roster
{
    [JsonPropertyName("version")]
    public int Version { get; set; } = 1;

    /// Guild members Bram has recognized at a table.
    [JsonPropertyName("members")]
    public List<string> Members { get; set; } = new();

    /// Free-riders Bram has voted to tax in a previous match.
    [JsonPropertyName("taxed")]
    public List<string> Taxed { get; set; } = new();

    /// Load the roster; any failure (no filesystem, missing/garbled file) yields
    /// an empty roster — never fatal.
    internal static Roster Load(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new Roster();
            }
            var text = File.ReadAllText(path);
            return JsonSerializer.Deserialize(text, BramJson.Default.Roster) ?? new Roster();
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"[bram] starting with an empty roster ({e.GetType().Name}).");
            return new Roster();
        }
    }

    /// Persist the roster. Best-effort: a write failure is logged, never thrown.
    internal void Save(string path)
    {
        try
        {
            File.WriteAllText(path, JsonSerializer.Serialize(this, BramJson.Default.Roster));
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"[bram] could not persist roster ({e.GetType().Name}).");
        }
    }

    internal bool HasTaxed(string id) => Taxed.Contains(id);

    /// Env var (wasi:cli/environment) overriding where the roster lives.
    private const string MemPathEnv = "BRAM_MEMORY_PATH";
    /// Default roster file, relative to the first preopened directory.
    private const string DefaultMemPath = "bram-memory.json";

    /// Resolve the roster path: env override, else the default name.
    internal static string ResolvePath() =>
        Environment.GetEnvironmentVariable(MemPathEnv) is { Length: > 0 } p
            ? p
            : DefaultMemPath;
}

/// Source-generated JSON context — trim/NativeAOT-safe (no reflection).
[JsonSourceGenerationOptions(WriteIndented = true, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(Roster))]
internal partial class BramJson : JsonSerializerContext
{
}

/// One seated player's strategy state for a single match.
internal sealed class Brain
{
    private readonly string _memoryPath;
    private string _selfId = "bram";
    private string[] _seated = System.Array.Empty<string>();
    private readonly HashSet<string> _members = new();   // guild members seen this match
    private readonly HashSet<string> _taxedThisMatch = new();
    private Roster _roster = new();

    internal Brain(string memoryPath)
    {
        _memoryPath = memoryPath;
        _roster = Roster.Load(memoryPath);
    }

    /// Begin a new match: record the table and clear within-match bookkeeping.
    internal void MatchStart(string selfId, IReadOnlyList<string> players)
    {
        _selfId = string.IsNullOrEmpty(selfId) ? "bram" : selfId;
        _seated = players.Where(id => id != _selfId).ToArray();
        _members.Clear();
        _taxedThisMatch.Clear();
        foreach (var id in _seated)
        {
            if (IsMember(id))
            {
                _members.Add(id);
            }
        }
    }

    /// Talk phase: Bram always rallies the table with an honest BLOOM.
    internal Sig Talk(int round)
    {
        var sig = Knobs.AnchorPlant >= Knobs.BloomThreshold ? Sig.Bloom : Sig.Hold;
        Banter.Talk(round, PlantFor(), sig, _members.Count > 0);
        return sig;
    }

    /// Plant phase: the generous anchor — max out when a member is seated to keep
    /// the bloc's payout high, otherwise plant the steady anchor.
    internal int Plant(int round)
    {
        int plant = PlantFor();
        Banter.Plant(round, plant, _members.Count > 0);
        return Clamp(plant);
    }

    /// Vote phase: aim the guild's ballot at the fattest hoarder — the seated
    /// non-member, non-ally with the most kept seeds. Never a member, never an
    /// arbiter ally, never himself. A remembered free-rider is targeted first.
    internal string? Vote(IReadOnlyList<Deed> plants)
    {
        Deed? best = null;
        bool bestRemembered = false;
        foreach (var deed in plants)
        {
            if (deed.Id == _selfId || IsMember(deed.Id) || IsAlly(deed.Id))
            {
                continue; // never cross a member or an ally
            }
            int kept = 10 - deed.Plant;
            if (kept <= Knobs.UntaxableMin)
            {
                continue; // untaxable: nothing to reclaim
            }
            bool remembered = _roster.HasTaxed(deed.Id);
            if (best is null
                || (remembered && !bestRemembered)
                || (remembered == bestRemembered && kept > 10 - best.Value.Plant)
                || (remembered == bestRemembered && kept == 10 - best.Value.Plant
                    && string.CompareOrdinal(deed.Id, best.Value.Id) < 0))
            {
                best = deed;
                bestRemembered = remembered;
            }
        }

        if (best is null)
        {
            Banter.Abstain();
            return null;
        }

        _taxedThisMatch.Add(best.Value.Id);
        Banter.Vote(best.Value.Id, 10 - best.Value.Plant);
        return best.Value.Id;
    }

    /// Fold this match into the roster (members rallied, free-riders taxed) and
    /// persist it.
    internal void MatchEnd()
    {
        foreach (var id in _members)
        {
            if (!_roster.Members.Contains(id))
            {
                _roster.Members.Add(id);
            }
        }
        foreach (var id in _taxedThisMatch)
        {
            if (!_roster.Taxed.Contains(id))
            {
                _roster.Taxed.Add(id);
            }
        }
        _roster.Save(_memoryPath);
        Banter.MatchEnd(_roster.Members.Count, _roster.Taxed.Count);
    }

    // ──────────────────────── recognition ────────────────────────

    /// The guild: the two simplest bots are, in effect, Bram's members — every
    /// BLOOM he broadcasts pumps Micro's plant, and Gopher's win-stay reflex
    /// keeps cooperating while the payout stays high. Also anyone he has rallied
    /// before (persisted in the roster).
    private bool IsMember(string id)
    {
        var lower = id.ToLowerInvariant();
        return lower.Contains("micro") || lower.Contains("gopher") || _roster.Members.Contains(id);
    }

    /// The arbiters share Bram's politics; he never aims the tax at them.
    private static bool IsAlly(string id)
    {
        var lower = id.ToLowerInvariant();
        return lower.Contains("keith") || lower.Contains("andy");
    }

    private int PlantFor() => _members.Count > 0 ? Knobs.RallyPlant : Knobs.AnchorPlant;

    private static int Clamp(int plant) => Math.Clamp(plant, 0, 10);
}
