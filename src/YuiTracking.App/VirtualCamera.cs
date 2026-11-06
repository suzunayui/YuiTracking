using System.IO.MemoryMappedFiles;
using Microsoft.Win32;
namespace YuiTracking;

// Unity Capture's documented shared-memory protocol (Source/shared.inl).
// Dedicated slot 42; no desktop or physical-camera capture APIs in this component.
public sealed class VirtualCamera : IDisposable
{
    public const int Width = 1280, Height = 720, FrameBytes = Width * Height * 4;
    public const string ClassId = "{5C2CD55C-92AD-4999-8666-912BD3E7003B}";
    public const string Category = "{860BB310-5D01-11D0-BD3B-00A0C911CE86}";
    public const string FilterRevision = "quiet-v1";
    private readonly string suffix; // Production: ASCII '0' + slot 42 = 'Z'
    private readonly object gate = new();
    private readonly byte[] transparent = new byte[FrameBytes];
    private byte[]? latest;
    private byte[] back = new byte[FrameBytes];
    private long lastFrame;
    private bool privacy, disposed;
    private readonly FramePump timer;
    private MemoryMappedFile? memory;
    private MemoryMappedViewAccessor? view;
    private Mutex? mutex;
    private EventWaitHandle? sent;
    private readonly EventWaitHandle want;
    public string Status { get; private set; } = "OBSの接続待ち";
    public VirtualCamera(string channelSuffix = "Z")
    { suffix = channelSuffix; want = new(false, EventResetMode.AutoReset, "UnityCapture_Want" + suffix); timer = new FramePump(() => Tick(null)); }
    public void Submit(byte[] rgba)
    {
        if (rgba.Length != FrameBytes) throw new ArgumentException("Unexpected render-frame size.");
        // DirectShow's RGB output is bottom-up; Canvas pixels arrive top-down.
        const int stride = Width * 4;
        lock (gate)
        {
            if (disposed || privacy) return;
            for (var y = 0; y < Height; y++) Buffer.BlockCopy(rgba, y * stride, back, (Height - y - 1) * stride, stride);
            var old = latest; latest = back; back = old ?? new byte[FrameBytes];
            lastFrame = Environment.TickCount64;
        }
    }
    public void SetPrivacy(bool value) { lock (gate) { privacy = value; latest = null; lastFrame = 0; } }
    private void Tick(object? state)
    {
        lock (gate)
        {
            if (disposed) return;
            try
            {
                if (view == null)
                {
                    mutex ??= Mutex.OpenExisting("UnityCapture_Mutx" + suffix);
                    sent ??= EventWaitHandle.OpenExisting("UnityCapture_Sent" + suffix);
                    memory ??= MemoryMappedFile.OpenExisting("UnityCapture_Data" + suffix);
                    view = memory.CreateViewAccessor(0, 32L + FrameBytes);
                }
                var frame = privacy || latest == null || Environment.TickCount64 - lastFrame > 700 ? transparent : latest;
                bool acquired;
                try { acquired = mutex!.WaitOne(10); } catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) return;
                try
                {
                    if (view.ReadUInt32(0) < FrameBytes) throw new InvalidOperationException("Camera buffer too small.");
                    view.Write(4, Width); view.Write(8, Height); view.Write(12, Width);
                    view.Write(16, 0); view.Write(20, 1); view.Write(24, 0); view.Write(28, 700);
                    view.WriteArray(32, frame, 0, frame.Length);
                }
                finally { mutex!.ReleaseMutex(); }
                sent!.Set();
                Status = want.WaitOne(0) ? (ReferenceEquals(frame, transparent) ? "透過を送信中" : "アバターを送信中") : "OBSの接続待ち";
            }
            catch (WaitHandleCannotBeOpenedException) { Status = "OBSの接続待ち"; }
            catch (FileNotFoundException) { Status = "OBSの接続待ち"; }
            catch (Exception ex) { Status = "出力エラー: " + ex.Message; ResetConnection(); }
        }
    }
    public static bool IsRegistered()
    {
        using var key = Registry.CurrentUser.OpenSubKey($@"Software\Classes\CLSID\{ClassId}\InprocServer32");
        var expected = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking", "VirtualCamera", FilterRevision, "UnityCaptureFilter64.dll");
        return key?.GetValue("") is string path && string.Equals(path, expected, StringComparison.OrdinalIgnoreCase) && File.Exists(path);
    }
    public static void Register(string dll)
    {
        if (!File.Exists(dll)) throw new FileNotFoundException("仮想カメラDLLが見つかりません。", dll);
        var cameraDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking", "VirtualCamera");
        var destDir = Path.Combine(cameraDir, FilterRevision);
        Directory.CreateDirectory(destDir);
        var dest = Path.Combine(destDir, "UnityCaptureFilter64.dll");
        var previous = Path.Combine(cameraDir, "UnityCaptureFilter64.dll");
        var legacy = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HoloTrack", "VirtualCamera", "UnityCaptureFilter64.dll");
        using (var existing = Registry.ClassesRoot.OpenSubKey($@"CLSID\{ClassId}\InprocServer32"))
            if (existing?.GetValue("") is string path && !string.Equals(path, dest, StringComparison.OrdinalIgnoreCase) && !string.Equals(path, previous, StringComparison.OrdinalIgnoreCase) && !string.Equals(path, legacy, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("この仮想カメラスロットは別のアプリで使用中です。");
        if (!File.Exists(dest)) File.Copy(dll, dest);
        using var server = Registry.CurrentUser.CreateSubKey($@"Software\Classes\CLSID\{ClassId}\InprocServer32");
        server.SetValue("", dest); server.SetValue("ThreadingModel", "Both");
        using var device = Registry.CurrentUser.CreateSubKey($@"Software\Classes\CLSID\{Category}\Instance\{ClassId}");
        device.SetValue("CLSID", ClassId); device.SetValue("FriendlyName", "YuiTracking Camera");
        // Preserve existing OBS device selection when upgrading an older install.
        if (device.GetValue("DevicePath") is not string)
            device.SetValue("DevicePath", "yuitracking:avatar:42");
    }
    private void ResetConnection()
    {
        view?.Dispose(); view = null; memory?.Dispose(); memory = null;
        mutex?.Dispose(); mutex = null; sent?.Dispose(); sent = null;
    }
    public void Dispose()
    {
        lock (gate) { if (disposed) return; privacy = true; }
        Tick(null); // Replace the last avatar frame with a safe frame before disconnecting.
        lock (gate) { disposed = true; }
        timer.Dispose();
        lock (gate) { ResetConnection(); want.Dispose(); }
    }
}
