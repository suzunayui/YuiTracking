using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace YuiTracking;

// One preset per file, in the same format as the Mac app's preset-logic.js.
internal static class PresetFile
{
    internal const int MaximumBytes = 64 * 1024;
    private const string Format = "yuitracking-preset";
    private const int Version = 1;
    private const string Unreadable = "プリセットのファイルとして読み込めません。";
    private static readonly string[] GazeModes = { "tracking", "camera", "fixed" };
    private static readonly HashSet<string> Keys = new()
    {
        "gazeStrength", "gazeRange", "smoothing", "sensitivity", "mouthOpenStrength", "mouthSensitivity", "springStrength", "chestSpringStrength",
        "bodyStrength", "forwardLeanStrength", "backwardLeanStrength", "sideTiltStrength", "nearZoomStrength", "farZoomStrength", "zoomCenterX", "zoomCenterY"
    };

    internal static string Serialized(MotionPreset preset)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            writer.WriteStartObject();
            writer.WriteString("format", Format);
            writer.WriteNumber("version", Version);
            writer.WriteString("name", preset.Name);
            writer.WriteString("gazeMode", preset.GazeMode);
            writer.WriteStartObject("values");
            foreach (var (key, value) in preset.Values) writer.WriteNumber(key, value);
            writer.WriteEndObject();
            writer.WriteStartArray("disabled");
            foreach (var key in preset.Disabled ?? new List<string>()) writer.WriteStringValue(key);
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    // Other people's files are untrusted: only known sliders and finite numbers get through.
    internal static MotionPreset Parsed(string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("format", out var format) || format.ValueKind != JsonValueKind.String || format.GetString() != Format) throw new InvalidDataException(Unreadable);
            if (!root.TryGetProperty("version", out var version) || version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var number) || number < 1) throw new InvalidDataException(Unreadable);
            if (number > Version) throw new InvalidDataException("新しいバージョンのアプリで作られたプリセットです。アプリを更新してください。");
            var name = root.TryGetProperty("name", out var nameItem) && nameItem.ValueKind == JsonValueKind.String ? Shortened((nameItem.GetString() ?? "").Trim(), MotionPresets.MaximumNameLength) : "";
            if (name.Length == 0) throw new InvalidDataException(Unreadable);
            var gazeMode = root.TryGetProperty("gazeMode", out var gazeItem) && gazeItem.ValueKind == JsonValueKind.String ? gazeItem.GetString() : null;
            if (gazeMode == null || !GazeModes.Contains(gazeMode)) throw new InvalidDataException(Unreadable);
            var values = new Dictionary<string, double>();
            if (root.TryGetProperty("values", out var valueItems) && valueItems.ValueKind == JsonValueKind.Object)
                foreach (var item in valueItems.EnumerateObject())
                    if (Keys.Contains(item.Name) && item.Value.ValueKind == JsonValueKind.Number && item.Value.TryGetDouble(out var value) && double.IsFinite(value)) values[item.Name] = value;
            if (values.Count == 0) throw new InvalidDataException(Unreadable);
            var disabled = new List<string>();
            if (root.TryGetProperty("disabled", out var disabledItems) && disabledItems.ValueKind == JsonValueKind.Array)
                foreach (var item in disabledItems.EnumerateArray())
                    if (item.ValueKind == JsonValueKind.String && item.GetString() is string key && Keys.Contains(key) && !disabled.Contains(key)) disabled.Add(key);
            return new MotionPreset(name, gazeMode, values, disabled);
        }
        catch (JsonException) { throw new InvalidDataException(Unreadable); }
    }

    // An imported preset never replaces an existing one, so a taken name gets a number.
    internal static string UniqueName(IEnumerable<MotionPreset> presets, string name)
    {
        var names = presets.Select(preset => preset.Name).ToList();
        bool Taken(string text) => names.Any(item => string.Equals(item.Trim(), text.Trim(), StringComparison.OrdinalIgnoreCase));
        if (!Taken(name)) return name;
        for (var number = 2; ; number++)
        {
            var suffix = $" ({number})";
            var candidate = Shortened(name, MotionPresets.MaximumNameLength - suffix.Length).TrimEnd() + suffix;
            if (!Taken(candidate)) return candidate;
        }
    }

    internal static string FileName(string name)
    {
        var safe = new string(name.Select(item => item < ' ' || "<>:\"/\\|?*".Contains(item) ? '_' : item).ToArray()).TrimEnd('.', ' ').TrimStart();
        return (safe.Length == 0 ? "preset" : safe) + ".json";
    }

    private static string Shortened(string text, int length)
    {
        if (text.Length <= length) return text;
        var cut = char.IsHighSurrogate(text[length - 1]) ? length - 1 : length;
        return text[..cut].TrimEnd();
    }
}
