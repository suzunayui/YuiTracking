namespace YuiTracking;

// HandTracking is null in presets saved before it was added: they leave the switch alone.
internal record MotionPreset(string Name, string GazeMode, Dictionary<string, double> Values, List<string>? Disabled = null, bool? HandTracking = null);

internal static class MotionPresets
{
    internal const int MaximumPresets = 30, MaximumNameLength = 20;
    private const double Tolerance = .0005;

    private static bool SameName(string left, string right) => string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);

    // Returns what is wrong with the name, or null when it can be used.
    internal static string? NameProblem(IEnumerable<MotionPreset> presets, string? name, string? currentName = null)
    {
        var text = name?.Trim() ?? "";
        if (text.Length == 0) return "名前を入力してください。";
        if (text.Length > MaximumNameLength) return $"名前は{MaximumNameLength}文字以内にしてください。";
        if (presets.Any(preset => SameName(preset.Name, text) && (currentName == null || !SameName(preset.Name, currentName)))) return "同じ名前のプリセットがあります。";
        return null;
    }

    internal static string NextName(IReadOnlyCollection<MotionPreset> presets)
    {
        for (var number = presets.Count + 1; ; number++)
        {
            var name = $"プリセット{number}";
            if (!presets.Any(preset => SameName(preset.Name, name))) return name;
        }
    }

    internal static IReadOnlyList<MotionPreset> Added(IEnumerable<MotionPreset> presets, MotionPreset preset) =>
        presets.Append(preset with { Name = preset.Name.Trim() }).Take(MaximumPresets).ToList();

    internal static IReadOnlyList<MotionPreset> Overwritten(IEnumerable<MotionPreset> presets, string name, string gazeMode, Dictionary<string, double> values, List<string>? disabled = null, bool? handTracking = null) =>
        presets.Select(preset => SameName(preset.Name, name) ? preset with { GazeMode = gazeMode, Values = values, Disabled = disabled, HandTracking = handTracking } : preset).ToList();

    internal static IReadOnlyList<MotionPreset> Renamed(IEnumerable<MotionPreset> presets, string name, string newName) =>
        presets.Select(preset => SameName(preset.Name, name) ? preset with { Name = newName.Trim() } : preset).ToList();

    internal static IReadOnlyList<MotionPreset> Without(IEnumerable<MotionPreset> presets, string name) =>
        presets.Where(preset => !SameName(preset.Name, name)).ToList();

    // Keys added in a later version are not part of an older preset, so only saved values are compared.
    internal static bool Matches(MotionPreset preset, string gazeMode, IReadOnlyDictionary<string, double> current, IEnumerable<string>? disabled = null, bool? handTracking = null) =>
        preset.GazeMode == gazeMode && preset.Values.All(item => current.TryGetValue(item.Key, out var value) && Math.Abs(value - item.Value) <= Tolerance)
        && (preset.Disabled ?? new List<string>()).ToHashSet().SetEquals(disabled ?? Array.Empty<string>())
        && (preset.HandTracking == null || handTracking == null || preset.HandTracking == handTracking);
}
