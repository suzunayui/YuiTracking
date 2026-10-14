using Windows.Devices.Enumeration;
namespace YuiTracking;

internal static class NativeCameraCatalog
{
    internal static bool IsVirtual(string label) => new[]
    { "YuiTracking Camera", "HoloTrack Avatar Camera", "Unity Video Capture", "OBS Virtual Camera", "WarudoCam" }
        .Any(name => label.Contains(name, StringComparison.OrdinalIgnoreCase));

    internal static async Task<IReadOnlyList<(string Id, string Label)>> EnumerateAsync()
    {
        var devices = await DeviceInformation.FindAllAsync(DeviceClass.VideoCapture);
        return devices.Where(d => d.IsEnabled && !IsVirtual(d.Name))
            .Select(d => (d.Id, d.Name)).ToList();
    }
}
