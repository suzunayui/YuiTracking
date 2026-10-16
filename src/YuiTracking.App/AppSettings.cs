using System.Text.Json;
using System.Text.Json.Nodes;

namespace YuiTracking;

internal static class AppSettings
{
    public static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking", "settings.json");

    private static JsonObject Read() => File.Exists(FilePath)
        ? JsonNode.Parse(File.ReadAllText(FilePath)) as JsonObject ?? throw new InvalidDataException("設定ファイルはJSONオブジェクトで指定してください。")
        : new JsonObject();

    public static string? DefaultVrmPath => Read()["defaultVrmPath"]?.GetValue<string>();
    public static string? DefaultSample => Read()["defaultSample"]?.GetValue<string>();
    public static string BackgroundColor => Read()["backgroundColor"]?.GetValue<string>() ?? "#00ff00";
    public static string? BackgroundImagePath => Read()["backgroundImagePath"]?.GetValue<string>();
    public static void SaveBackground(string color, string? imagePath)
    {
        var settings = Read(); settings["backgroundColor"] = color;
        settings["backgroundImagePath"] = imagePath; Save(settings);
    }
    public static void SaveDefaultSample(string sample)
    {
        if (sample is not ("Y" or "Z" or "robot")) throw new ArgumentException("Unknown sample.", nameof(sample));
        var settings = Read(); settings["defaultSample"] = sample; Save(settings);
    }
    public static double SpringStrength
    {
        get { var value = Read()["springStrength"]?.GetValue<double>() ?? 1; return double.IsFinite(value) ? Math.Clamp(value, .3, 5) : 1; }
    }
    public static void SaveSpringStrength(double value)
    {
        if (!double.IsFinite(value)) return;
        var settings = Read(); settings["springStrength"] = Math.Clamp(value, .3, 5); Save(settings);
    }
    public static bool VirtualCameraEnabled => Read()["virtualCameraEnabled"]?.GetValue<bool>() ?? false;
    public static void SaveVirtualCameraEnabled(bool enabled)
    {
        var settings = Read(); settings["virtualCameraEnabled"] = enabled; Save(settings);
    }
    public static double FaceSensitivity
    {
        get { var value = Read()["sensitivity"]?.GetValue<double>() ?? 1; return double.IsFinite(value) ? Math.Clamp(value, .3, 2) : 1; }
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
    public static void SaveMouthSettings(double opening, double sensitivity, double faceSensitivity)
    {
        if (!double.IsFinite(opening) || !double.IsFinite(sensitivity) || !double.IsFinite(faceSensitivity)) return;
        var settings = Read(); settings["mouthOpenStrength"] = Math.Clamp(opening, .5, 3); settings["mouthSensitivity"] = Math.Clamp(sensitivity, .5, 3); settings["sensitivity"] = Math.Clamp(faceSensitivity, .3, 2); Save(settings);
    }
    public record Framing(double Zoom, double X, double Y, double Z, double? TargetX = null, double? TargetY = null, double? TargetZ = null);
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
        settings.Remove("defaultSample");
        Save(settings);
    }
    private static void Save(JsonObject settings)
    {
        settings.Remove("lightweightMode");
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        var temporary = FilePath + ".tmp";
        File.WriteAllText(temporary, settings.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, FilePath, true);
    }
}
