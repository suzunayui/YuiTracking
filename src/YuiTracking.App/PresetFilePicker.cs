using System.Runtime.InteropServices;

namespace YuiTracking;

// IFileDialog works for unpackaged and packaged builds alike, as VrmFilePicker does.
internal sealed class PresetFilePicker : IDisposable
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
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int WithHandle(IntPtr self, IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetItem(IntPtr self, out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetOptions(IntPtr self, uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetOptions(IntPtr self, out uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetFilters(IntPtr self, uint count, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] Filter[] filters);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetText(IntPtr self, [MarshalAs(UnmanagedType.LPWStr)] string value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetName(IntPtr self, uint format, out IntPtr value);
    private static T Method<T>(IntPtr instance, int slot) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), slot * IntPtr.Size));

    private PresetFilePicker(string clsidText, string iidText, uint extraOptions, string title)
    {
        var clsid = new Guid(clsidText);
        var iid = new Guid(iidText);
        Marshal.ThrowExceptionForHR(CoCreateInstance(ref clsid, IntPtr.Zero, 1, ref iid, out dialog));
        try
        {
            Marshal.ThrowExceptionForHR(Method<GetOptions>(dialog, 10)(dialog, out var options));
            Marshal.ThrowExceptionForHR(Method<SetOptions>(dialog, 9)(dialog, options | 0x40 | 0x800 | 0x8 | extraOptions));
            Marshal.ThrowExceptionForHR(Method<SetFilters>(dialog, 4)(dialog, 1, [new() { Name = "YuiTracking preset", Pattern = "*.json" }]));
            Marshal.ThrowExceptionForHR(Method<SetText>(dialog, 17)(dialog, title));
        }
        catch { Dispose(); throw; }
    }

    internal static PresetFilePicker ForOpening() =>
        new("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7", "42F85136-DB7E-439C-85F1-E4075D135FC8", 0x1000, "プリセットを読み込む");

    internal static PresetFilePicker ForSaving(string fileName)
    {
        var picker = new PresetFilePicker("C0B4E2F3-BA21-4773-8DBA-335EC946EB8B", "84BCCD23-5FDE-4CDB-AEA4-AF64B83D78AB", 0x2, "プリセットを書き出す");
        try
        {
            Marshal.ThrowExceptionForHR(Method<SetText>(picker.dialog, 15)(picker.dialog, fileName));
            Marshal.ThrowExceptionForHR(Method<SetText>(picker.dialog, 22)(picker.dialog, "json"));
            return picker;
        }
        catch { picker.Dispose(); throw; }
    }

    internal string? Show(IntPtr owner)
    {
        var hr = Method<WithHandle>(dialog, 3)(dialog, owner);
        if (hr == unchecked((int)0x800704C7)) return null;
        Marshal.ThrowExceptionForHR(hr);
        Marshal.ThrowExceptionForHR(Method<GetItem>(dialog, 20)(dialog, out var item));
        try
        {
            Marshal.ThrowExceptionForHR(Method<GetName>(item, 5)(item, 0x80058000, out var value));
            try { return Marshal.PtrToStringUni(value) ?? throw new IOException("ファイルのパスを取得できません。"); }
            finally { Marshal.FreeCoTaskMem(value); }
        }
        finally { Marshal.Release(item); }
    }

    public void Dispose() { if (dialog == IntPtr.Zero) return; Marshal.Release(dialog); dialog = IntPtr.Zero; }
}
