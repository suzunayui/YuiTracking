namespace HoloTrack;

// Right Ctrl alone calibrates on release. A chord or auto-repeat must not
// accidentally calibrate while the user is using another application's shortcut.
internal sealed class RightControlGesture
{
    // IME/DBE virtual keys (for example 0xF4) encode input-mode state and
    // can stay down permanently. They are not physical shortcut chords.
    internal static bool IsPhysicalChordKey(int key) => key is
        0x08 or 0x09 or 0x0C or 0x0D or 0x13 or 0x14 or 0x1B or
        >= 0x20 and <= 0x28 or >= 0x2C and <= 0x2E or
        >= 0x30 and <= 0x39 or >= 0x41 and <= 0x5D or
        >= 0x60 and <= 0x87 or 0x90 or 0x91 or
        >= 0xA0 and <= 0xA5 or >= 0xBA and <= 0xC0 or
        >= 0xDB and <= 0xDF or 0xE2;
    private bool held, candidate;
    internal bool Update(bool rightControl, bool keyDown, bool otherKeyHeld = false, bool injected = false)
    {
        if (injected) return false;
        if (!rightControl)
        {
            if (keyDown) candidate = false;
            return false;
        }
        if (keyDown)
        {
            if (!held) candidate = !otherKeyHeld;
            held = true;
            return false;
        }
        var trigger = held && candidate;
        held = candidate = false;
        return trigger;
    }
}
