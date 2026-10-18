using System.Text.RegularExpressions;

namespace YuiTracking;

// Windows and WebView2 can expose different subsets before camera permission.
// Keep both current snapshots; a browser refresh must not erase native devices.
public sealed class CameraChoices
{
    internal const string DefaultId = "default:";
    public record Item(string Id, string Label, bool Native = false);
    private List<Item> native = new(), browser = new();
    internal int NativeCount => native.Count;
    internal void UpdateNative(IEnumerable<Item> items) => native = items.ToList();
    internal void UpdateBrowser(IEnumerable<Item> items) => browser = items.ToList();
    private static string Name(string label) => Regex.Replace(label.Trim(), @"\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$", "", RegexOptions.IgnoreCase).ToLowerInvariant();
    internal object StartCommand(Item item) => new
    {
        type = "startTracking",
        deviceId = !item.Native && item.Id != DefaultId ? item.Id : "",
        cameraLabel = item.Native ? item.Label : "",
        singleNativeCamera = item.Native && NativeCount == 1
    };
    internal List<Item> Build()
    {
        var list = browser.Where(item => !string.IsNullOrWhiteSpace(item.Id) &&
            (native.Count == 0 || !Regex.IsMatch(item.Label, @"^カメラ \d+$"))).ToList();
        foreach (var item in native)
        {
            // Only merge unambiguous name matches. Never map an unrelated device.
            var name = Name(item.Label);
            if (name.Length > 0 && native.Count(n => Name(n.Label) == name) == 1 && list.Count(b => Name(b.Label) == name) == 1) continue;
            list.Add(item);
        }
        list.Insert(0, new(DefaultId, "システム既定のカメラ"));
        return list;
    }
    internal static Item Select(IReadOnlyList<Item> items, Item? previous)
    {
        var exact = items.FirstOrDefault(item => previous != null && item.Id == previous.Id && item.Native == previous.Native);
        if (exact != null) return exact;
        if (previous != null)
        {
            var matches = items.Where(item => Name(item.Label) == Name(previous.Label)).ToList();
            if (matches.Count == 1) return matches[0];
        }
        return items.FirstOrDefault(item => item.Id != DefaultId) ?? items[0];
    }
}
