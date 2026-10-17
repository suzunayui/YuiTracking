using System.Runtime.InteropServices;
using YuiTracking;
internal static class Program
{
    [DllImport("ole32.dll")] private static extern int CoInitializeEx(IntPtr reserved, uint mode);
    [DllImport("ole32.dll")] private static extern void CoUninitialize();
    [STAThread]
    private static void Main()
    {
        Marshal.ThrowExceptionForHR(CoInitializeEx(IntPtr.Zero, 2));
        var root = Path.Combine(Path.GetTempPath(), "yuitracking-picker-" + Guid.NewGuid());
        var current = Path.Combine(root, "モデル Current"); var previous = Path.Combine(root, "Last VRM");
        Directory.CreateDirectory(current); Directory.CreateDirectory(previous);
        try
        {
            var currentFile = Path.Combine(current, "current.vrm"); var previousFile = Path.Combine(previous, "previous.vrm");
            if (VrmFilePicker.InitialFolder(currentFile, previousFile) != current) throw new Exception("Current folder must win");
            if (VrmFilePicker.InitialFolder(null, previousFile) != previous) throw new Exception("Last folder fallback failed");
            if (VrmFilePicker.InitialFolder(Path.Combine(root, "missing", "avatar.vrm"), previousFile) != previous) throw new Exception("Missing folder fallback failed");
            if (VrmFilePicker.InitialFolder(null, "relative.vrm") != null) throw new Exception("Relative paths must not select the working directory");
            using (var picker = new VrmFilePicker(current))
                if (!string.Equals(picker.InitialFolderPath(), current, StringComparison.OrdinalIgnoreCase)) throw new Exception("Native dialog did not use the current VRM folder");
            using (var picker = new VrmFilePicker(previous))
                if (!string.Equals(picker.InitialFolderPath(), previous, StringComparison.OrdinalIgnoreCase)) throw new Exception("Native dialog did not override the previous location");
            Console.WriteLine("PASS VRM picker current folder, last folder, missing/relative paths, native SetFolder and Unicode paths");
        }
        finally { Directory.Delete(root, true); CoUninitialize(); }
    }
}
