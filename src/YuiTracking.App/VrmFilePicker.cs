using System.Runtime.InteropServices;

namespace YuiTracking;

// IFileDialog.SetFolder explicitly overrides the shell's remembered location.
internal sealed class VrmFilePicker : IDisposable
{
    private IntPtr dialog;
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Filter
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string Name;
        [MarshalAs(UnmanagedType.LPWStr)] public string Pattern;
    }
    [DllImport("ole32.dll", ExactSpelling = true)]
    private static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint context, ref Guid iid, out IntPtr instance);
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
    private static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IntPtr item);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int WithHandle(IntPtr self, IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetItem(IntPtr self, out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetOptions(IntPtr self, uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetOptions(IntPtr self, out uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetFilters(IntPtr self, uint count, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] Filter[] filters);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetName(IntPtr self, uint format, out IntPtr value);
    private static T Method<T>(IntPtr instance, int slot) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), slot * IntPtr.Size));

    internal static string? InitialFolder(params string?[] files)
    {
        foreach (var file in files)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(file) && Path.IsPathFullyQualified(file) && Path.GetDirectoryName(file) is string folder && Directory.Exists(folder)) return folder;
            }
            catch (ArgumentException) { }
        }
        return null;
    }
    internal VrmFilePicker(string? initialFolder)
    {
        var clsid = new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7");
        var iid = new Guid("42F85136-DB7E-439C-85F1-E4075D135FC8");
        Marshal.ThrowExceptionForHR(CoCreateInstance(ref clsid, IntPtr.Zero, 1, ref iid, out dialog));
        try
        {
            Marshal.ThrowExceptionForHR(Method<GetOptions>(dialog, 10)(dialog, out var options));
            Marshal.ThrowExceptionForHR(Method<SetOptions>(dialog, 9)(dialog, options | 0x40 | 0x800 | 0x1000 | 0x8));
            Marshal.ThrowExceptionForHR(Method<SetFilters>(dialog, 4)(dialog, 1, [new() { Name = "VRM avatar", Pattern = "*.vrm" }]));
            if (initialFolder != null)
            {
                var itemId = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
                Marshal.ThrowExceptionForHR(SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, ref itemId, out var folder));
                try { Marshal.ThrowExceptionForHR(Method<WithHandle>(dialog, 12)(dialog, folder)); }
                finally { Marshal.Release(folder); }
            }
        }
        catch { Dispose(); throw; }
    }
    private static string FileSystemPath(IntPtr item)
    {
        Marshal.ThrowExceptionForHR(Method<GetName>(item, 5)(item, 0x80058000, out var value));
        try { return Marshal.PtrToStringUni(value) ?? throw new IOException("ファイルのパスを取得できません。"); }
        finally { Marshal.FreeCoTaskMem(value); }
    }
    internal string InitialFolderPath()
    {
        Marshal.ThrowExceptionForHR(Method<GetItem>(dialog, 13)(dialog, out var folder));
        try { return FileSystemPath(folder); }
        finally { Marshal.Release(folder); }
    }
    internal string? Show(IntPtr owner)
    {
        var hr = Method<WithHandle>(dialog, 3)(dialog, owner);
        if (hr == unchecked((int)0x800704C7)) return null;
        Marshal.ThrowExceptionForHR(hr);
        Marshal.ThrowExceptionForHR(Method<GetItem>(dialog, 20)(dialog, out var file));
        try { return FileSystemPath(file); }
        finally { Marshal.Release(file); }
    }
    public void Dispose() { if (dialog == IntPtr.Zero) return; Marshal.Release(dialog); dialog = IntPtr.Zero; }
}
