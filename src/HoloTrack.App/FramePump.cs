using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace HoloTrack;
internal sealed class FramePump : IDisposable
{
    private readonly ManualResetEvent stop = new(false);
    private readonly Thread thread;
    private readonly Action tick;
    private sealed class TimerHandle : WaitHandle { public TimerHandle(SafeWaitHandle handle) => SafeWaitHandle = handle; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeWaitHandle CreateWaitableTimerExW(IntPtr attributes, string? name, uint flags, uint access);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWaitableTimer(SafeWaitHandle timer, ref long dueTime, int period, IntPtr callback, IntPtr argument, bool resume);
    public FramePump(Action tick)
    {
        this.tick = tick;
        thread = new Thread(Run) { IsBackground = true, Name = "YuiTracking camera output" };
        thread.Start();
    }
    private void Run()
    {
        var handle = CreateWaitableTimerExW(IntPtr.Zero, null, 2, 0x1F0003);
        if (handle.IsInvalid) { handle.Dispose(); handle = CreateWaitableTimerExW(IntPtr.Zero, null, 0, 0x1F0003); }
        using var timer = new TimerHandle(handle);
        var waits = new WaitHandle[] { stop, timer };
        var clock = Stopwatch.StartNew(); double next = 0;
        while (!stop.WaitOne(0))
        {
            tick();
            next += 1000.0 / 60;
            var now = clock.Elapsed.TotalMilliseconds;
            if (next <= now) next = now + 1000.0 / 60;
            var due = -(long)Math.Max(1, (next - now) * 10000);
            if (handle.IsInvalid || !SetWaitableTimer(handle, ref due, 0, IntPtr.Zero, IntPtr.Zero, false))
            { if (stop.WaitOne((int)Math.Max(1, next - now))) break; }
            else if (WaitHandle.WaitAny(waits) == 0) break;
        }
    }
    public void Dispose() { stop.Set(); thread.Join(); stop.Dispose(); }
}
