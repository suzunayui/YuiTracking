using System.IO.MemoryMappedFiles;
using System.Text.Json;
using Microsoft.Win32;

if (args.Length == 0) args = JsonSerializer.Deserialize<string[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "probe-task.json")))!;
if (args[0] == "read")
{
    var probeId = Guid.ParseExact(args[1], "N").ToString("N");
    string consumerIdentity;
    try { consumerIdentity = Windows.ApplicationModel.Package.Current.Id.Name; } catch { consumerIdentity = "unpackaged"; }
    using var r = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64);
    using var a = r.OpenSubKey($"Software\\Classes\\CLSID\\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}}\\InprocServer32");
    using var b = r.OpenSubKey($"Software\\Classes\\CLSID\\{{860BB310-5D01-11D0-BD3B-00A0C911CE86}}\\Instance\\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}}");
    var file = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking", $"msix-probe-{probeId}.txt");
    using var mem = MemoryMappedFile.OpenExisting($"Local\\YuiTracking.MsixProbe.{probeId}");
    using var access = mem.CreateViewAccessor();
    File.WriteAllText(args[2], JsonSerializer.Serialize(new { consumerIdentity, cameraRegistry0 = a?.GetValue("MsixProbe-" + probeId) as string == probeId, cameraRegistry1 = b?.GetValue("MsixProbe-" + probeId) as string == probeId, sharedAppData = File.Exists(file) && File.ReadAllText(file) == probeId, sharedMemory = access.ReadInt32(0) == 12345678 }));
    return;
}
var id = Guid.ParseExact(args[0], "N").ToString("N");
var report = Path.GetFullPath(args[1]);
try
{
    var keys = new[] {
        $"Software\\Classes\\CLSID\\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}}\\InprocServer32",
        $"Software\\Classes\\CLSID\\{{860BB310-5D01-11D0-BD3B-00A0C911CE86}}\\Instance\\{{5C2CD55C-92AD-4999-8666-912BD3E7003B}}"
    };
    using var registry = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Registry64);
    var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking");
    var dataPath = Path.Combine(folder, $"msix-probe-{id}.txt");
    try
    {
        foreach (var path in keys) { using var key = registry.CreateSubKey(path); key.SetValue("MsixProbe-" + id, id); }
        using var verify = registry.OpenSubKey(keys[0]);
        Directory.CreateDirectory(folder); File.WriteAllText(dataPath, id);
        var name = $"Local\\YuiTracking.MsixProbe.{id}";
        using var memory = MemoryMappedFile.CreateNew(name, 16);
        using var view = memory.CreateViewAccessor(); view.Write(0, 12345678);
        using var done = new EventWaitHandle(false, EventResetMode.ManualReset, name + ".done");
        string identity;
        try { identity = Windows.ApplicationModel.Package.Current.Id.Name; } catch { identity = "unpackaged"; }
        File.WriteAllText(report, JsonSerializer.Serialize(new { identity, ready = true, writtenKey = keys[0], writtenValue = verify?.GetValue("MsixProbe-" + id) }));
        done.WaitOne(TimeSpan.FromSeconds(30));
    }
    finally
    {
        // Remove only random test values, through the same packaged view that created them.
        foreach (var path in keys) { using var key = registry.OpenSubKey(path, true); key?.DeleteValue("MsixProbe-" + id, false); }
        File.Delete(dataPath);
        File.WriteAllText(report + ".finished", "done");
    }
}
catch (Exception ex) { File.WriteAllText(report, JsonSerializer.Serialize(new { error = ex.ToString() })); }

