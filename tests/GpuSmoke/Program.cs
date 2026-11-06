using System.Text.Json;
using YuiTracking;
if (args.Contains("--selection"))
{
    static void Check(bool ok, string name) { if (!ok) throw new Exception(name); Console.WriteLine("PASS " + name); }
    GpuCatalog.Device Gpu(string id, string name, ulong gb = 16) => new(id, name, 0x10de, 1, gb * 1073741824UL);
    var one = new[] { Gpu("0,200", "RTX 5070 Ti") };
    var twin = new[] { Gpu("0,10", "RTX 4060 Ti", 8), Gpu("0,20", "RTX 4060 Ti", 8), Gpu("0,30", "RTX 5070 Ti") };
    Check(GpuCatalog.FindSaved(one, "0,200", "RTX 5070 Ti", null) == one[0], "same LUID keeps GPU");
    Check(GpuCatalog.FindSaved(one, "0,100", "RTX 5070 Ti", null) == one[0], "LUID changed by restart keeps GPU");
    Check(GpuCatalog.FindSaved(one, "0,200", "RTX 4060 Ti", null) == null, "removed GPU falls back to CPU");
    Check(GpuCatalog.FindSaved(one, null, null, null) == null, "missing saved GPU falls back to CPU");
    Check(GpuCatalog.FindSaved(twin, "0,20", "RTX 4060 Ti", 1) == twin[1], "matching LUID wins between identical GPUs");
    Check(GpuCatalog.FindSaved(twin, "0,99", "RTX 4060 Ti", 2) == twin[1], "changed LUID uses saved position");
    Check(GpuCatalog.FindSaved(twin, "0,99", "RTX 4060 Ti", null) == null, "identical GPUs are not guessed without a position");
    Check(GpuCatalog.FindSaved(twin, "0,99", "RTX 4060 Ti", 3) == null, "out-of-range position is not guessed");
    Check(GpuCatalog.Ordinal(twin, twin[1]) == 2 && GpuCatalog.Ordinal(twin, twin[2]) == 1, "position counts identical GPUs only");
    Check(GpuCatalog.Label(one, one[0]) == "RTX 5070 Ti · 16 GB", "single GPU label has no number");
    Check(GpuCatalog.Label(twin, twin[1]) == "RTX 4060 Ti · 8 GB（2台目）" && GpuCatalog.Label(twin, twin[2]) == "RTX 5070 Ti · 16 GB", "only identical GPUs are numbered");
    return;
}
var devices = GpuCatalog.Enumerate();
if (devices.Select(d => d.Id).Distinct().Count() != devices.Count) throw new Exception("Duplicate adapter LUID");
foreach (var device in devices)
{
    if (!System.Text.RegularExpressions.Regex.IsMatch(device.Id, @"^-?\d+,\d+$")) throw new Exception("Invalid LUID");
    if (string.IsNullOrWhiteSpace(device.Name)) throw new Exception("Missing adapter name");
}
Console.WriteLine(JsonSerializer.Serialize(devices));
