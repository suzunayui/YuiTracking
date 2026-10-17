using System.Globalization;
using System.Runtime.InteropServices;

namespace YuiTracking;

internal static class GpuCatalog
{
    internal record Device(string Id, string Name, uint VendorId, uint DeviceId, ulong MemoryBytes);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Description
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Name;
        public uint VendorId, DeviceId, SubsystemId, Revision;
        public UIntPtr VideoMemory, SystemMemory, SharedMemory;
        public uint LuidLow;
        public int LuidHigh;
        public uint Flags;
    }
    [DllImport("dxgi.dll", ExactSpelling = true)]
    private static extern int CreateDXGIFactory1(ref Guid id, out IntPtr factory);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int EnumAdapter(IntPtr factory, uint index, out IntPtr adapter);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int GetDescription(IntPtr adapter, out Description description);
    private static T Method<T>(IntPtr instance, int slot) where T : Delegate =>
        Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), slot * IntPtr.Size));

    internal static IReadOnlyList<Device> Enumerate()
    {
        var iid = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
        Marshal.ThrowExceptionForHR(CreateDXGIFactory1(ref iid, out var factory));
        var devices = new List<Device>();
        try
        {
            var enumerate = Method<EnumAdapter>(factory, 12); // IDXGIFactory1.EnumAdapters1
            for (uint index = 0; ; index++)
            {
                var hr = enumerate(factory, index, out var adapter);
                if (hr == unchecked((int)0x887A0002)) break; // DXGI_ERROR_NOT_FOUND
                Marshal.ThrowExceptionForHR(hr);
                try
                {
                    Marshal.ThrowExceptionForHR(Method<GetDescription>(adapter, 10)(adapter, out var desc));
                    if ((desc.Flags & 2) != 0) continue; // DXGI_ADAPTER_FLAG_SOFTWARE
                    var id = desc.LuidHigh.ToString(CultureInfo.InvariantCulture) + "," + desc.LuidLow.ToString(CultureInfo.InvariantCulture);
                    devices.Add(new(id, desc.Name.TrimEnd('\0'), desc.VendorId, desc.DeviceId, desc.VideoMemory.ToUInt64()));
                }
                finally { Marshal.Release(adapter); }
            }
        }
        finally { Marshal.Release(factory); }
        return devices;
    }

    internal static string BrowserArguments(Device device) => " --use-angle=d3d11 --use-adapter-luid=" + device.Id;
}
