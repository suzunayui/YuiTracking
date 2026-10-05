using System.Text.Json;
using System.Text.Json.Nodes;

namespace HoloTrack;

internal static class AppSettings
{
    public static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking", "settings.json");

    private static JsonObject Read() => File.Exists(FilePath)
        ? JsonNode.Parse(File.ReadAllText(FilePath)) as JsonObject ?? throw new InvalidDataException("設定ファイルはJSONオブジェクトで指定してください。")
        : new JsonObject();

    public static string? DefaultVrmPath => Read()["defaultVrmPath"]?.GetValue<string>();
    public static double SpringStrength
    {
        get { var value = Read()["springStrength"]?.GetValue<double>() ?? 1; return double.IsFinite(value) ? Math.Clamp(value, .3, 3) : 1; }
    }
    public static void SaveSpringStrength(double value)
    {
        if (!double.IsFinite(value)) return;
        var settings = Read(); settings["springStrength"] = Math.Clamp(value, .3, 3); Save(settings);
    }
    public static bool VirtualCameraEnabled => Read()["virtualCameraEnabled"]?.GetValue<bool>() ?? false;
    public static void SaveVirtualCameraEnabled(bool enabled)
    {
        var settings = Read(); settings["virtualCameraEnabled"] = enabled; Save(settings);
    }
    public static double MouthOpenStrength
    {
        get
        {
            var settings = Read(); var value = settings["mouthOpenStrength"]?.GetValue<double>() ?? (settings["mouthSensitivity"] == null ? 1.8 : 1);
            if (!double.IsFinite(value)) value = 1.8;
            return settings["mouthSensitivity"] == null ? 1 + Math.Max(0, Math.Clamp(value, .5, 3) - 1.8) / 1.2 : Math.Clamp(value, .5, 3);
        }
    }
    public static double MouthSensitivity
    {
        get { var settings = Read(); var value = settings["mouthSensitivity"]?.GetValue<double>() ?? settings["mouthOpenStrength"]?.GetValue<double>() ?? 1.8; return double.IsFinite(value) ? Math.Clamp(value, .5, 3) : 1.8; }
    }
    public static void SaveMouthSettings(double opening, double sensitivity)
    {
        if (!double.IsFinite(opening) || !double.IsFinite(sensitivity)) return;
        var settings = Read(); settings["mouthOpenStrength"] = Math.Clamp(opening, .5, 3); settings["mouthSensitivity"] = Math.Clamp(sensitivity, .5, 3); Save(settings);
    }
    public record Framing(double Zoom, double X, double Y, double Z);
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    public static Framing? SavedFraming => Read()["framing"]?.Deserialize<Framing>(JsonOptions);
    public static void SaveFraming(Framing framing)
    {
        var settings = Read();
        settings["framing"] = JsonSerializer.SerializeToNode(framing, JsonOptions);
        Save(settings);
    }

    public static void SaveDefaultVrm(string path)
    {
        var settings = Read();
        settings["defaultVrmPath"] = Path.GetFullPath(path);
        Save(settings);
    }
    private static void Save(JsonObject settings)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        var temporary = FilePath + ".tmp";
        File.WriteAllText(temporary, settings.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, FilePath, true);
    }
}
