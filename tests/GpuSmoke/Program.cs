using System.Text.Json;
using YuiTracking;
var devices = GpuCatalog.Enumerate();
if (devices.Select(d => d.Id).Distinct().Count() != devices.Count) throw new Exception("Duplicate adapter LUID");
foreach (var device in devices)
{
    if (!System.Text.RegularExpressions.Regex.IsMatch(device.Id, @"^-?\d+,\d+$")) throw new Exception("Invalid LUID");
    if (string.IsNullOrWhiteSpace(device.Name)) throw new Exception("Missing adapter name");
}
Console.WriteLine(JsonSerializer.Serialize(devices));
