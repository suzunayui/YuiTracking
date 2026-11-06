using System.Security.Cryptography;
using System.Text;

namespace YuiTracking;

internal static class VrmHistory
{
    internal const int MaximumEntries = 24;
    private const int MaximumThumbnailBytes = 2 * 1024 * 1024;

    internal static IReadOnlyList<string> WithUsed(IEnumerable<string> history, string path) =>
        new[] { path }.Concat(history.Where(item => !Same(item, path))).Take(MaximumEntries).ToList();

    internal static IReadOnlyList<string> Without(IEnumerable<string> history, string path) =>
        history.Where(item => !Same(item, path)).ToList();

    private static bool Same(string left, string right) => string.Equals(left, right, StringComparison.OrdinalIgnoreCase);

    internal static string ThumbnailFileName(string path) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path.ToUpperInvariant()))) + ".png";

    // Only accepts the PNG data URL the renderer produces.
    internal static byte[]? DecodeThumbnail(string? dataUrl)
    {
        const string prefix = "data:image/png;base64,";
        if (dataUrl == null || !dataUrl.StartsWith(prefix, StringComparison.Ordinal)) return null;
        if (dataUrl.Length > MaximumThumbnailBytes * 4 / 3 + prefix.Length) return null;
        try
        {
            var bytes = Convert.FromBase64String(dataUrl[prefix.Length..]);
            return bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 ? bytes : null;
        }
        catch (FormatException) { return null; }
    }
}
