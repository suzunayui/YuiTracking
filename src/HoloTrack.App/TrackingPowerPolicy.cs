using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace HoloTrack;

// Camera inference is a latency-sensitive workload even when the UI is behind
// another window. Opt its renderer out of Windows execution-speed throttling.
internal static class TrackingPowerPolicy
{
    [StructLayout(LayoutKind.Sequential)]
    private struct PowerState
    {
        public uint Version, ControlMask, StateMask;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint access, bool inherit, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetProcessInformation(SafeProcessHandle process, int informationClass, ref PowerState state, uint size);

    internal static int Apply(uint processId, bool tracking)
    {
        using var handle = OpenProcess(0x0200, false, processId); // PROCESS_SET_INFORMATION
        if (handle.IsInvalid) return Marshal.GetLastWin32Error();
        // ControlMask=0 restores system-managed QoS when camera tracking stops.
        var state = new PowerState { Version = 1, ControlMask = tracking ? 1u : 0u, StateMask = 0 };
        return SetProcessInformation(handle, 4, ref state, (uint)Marshal.SizeOf<PowerState>())
            ? 0 : Marshal.GetLastWin32Error();
    }
}
