using System.Runtime.InteropServices;
namespace HoloTrack;

internal sealed class CalibrationShortcut : IDisposable
{
    private readonly ManualResetEvent stop = new(false);
    private readonly Thread thread;
    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);
    private static bool Down(int key) => (GetAsyncKeyState(key) & 0x8000) != 0;

    internal CalibrationShortcut(Action calibrate)
    {
        // A low-level hook can be silently removed when the UI thread is busy.
        // Poll physical key state on a dedicated thread, independently of focus.
        thread = new Thread(() => Run(calibrate)) { IsBackground = true, Name = "YuiTracking calibration shortcut" };
        thread.Start();
    }

    private void Run(Action calibrate)
    {
        var control = new RightControlGesture();
        var shift = new RightControlGesture();
        var lastControl = Down(0xA3);
        var lastShift = Down(0xA1);
        // Keys held at startup must be released before becoming shortcuts.
        while (!stop.WaitOne(10))
        {
            var controlDown = Down(0xA3);
            var shiftDown = Down(0xA1);
            var controlOther = controlDown || lastControl ? OtherKeyHeld(0xA3, 0x11) : false;
            var shiftOther = shiftDown || lastShift ? OtherKeyHeld(0xA1, 0x10) : false;
            if (controlOther) control.Update(false, true);
            if (shiftOther) shift.Update(false, true);
            var trigger = false;
            if (controlDown != lastControl) trigger |= control.Update(true, controlDown, controlOther);
            if (shiftDown != lastShift) trigger |= shift.Update(true, shiftDown, shiftOther);
            lastControl = controlDown;
            lastShift = shiftDown;
            if (trigger) calibrate();
        }
    }

    private static bool OtherKeyHeld(int target, int alias)
    {
        for (var key = 8; key <= 254; key++)
        {
            if (key == target || key == alias || !RightControlGesture.IsPhysicalChordKey(key)) continue;
            if (Down(key)) return true;
        }
        return false;
    }

    public void Dispose()
    {
        stop.Set();
        thread.Join();
        stop.Dispose();
    }
}
