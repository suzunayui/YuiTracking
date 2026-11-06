namespace YuiTracking;

internal static class ScrollThumbMath
{
    private const double MinimumThumbHeight = 32;

    internal static bool CanScroll(double viewport, double extent) => viewport > 0 && extent > viewport + .5;

    internal static double ThumbHeight(double track, double viewport, double extent) =>
        Math.Min(track, Math.Max(MinimumThumbHeight, track * viewport / extent));

    internal static double ThumbTop(double offset, double track, double viewport, double extent)
    {
        var range = extent - viewport;
        if (range <= 0) return 0;
        return Math.Clamp(offset / range, 0, 1) * (track - ThumbHeight(track, viewport, extent));
    }

    internal static double OffsetFromThumbTop(double thumbTop, double track, double viewport, double extent)
    {
        var travel = track - ThumbHeight(track, viewport, extent);
        if (travel <= 0) return 0;
        return Math.Clamp(thumbTop / travel, 0, 1) * Math.Max(0, extent - viewport);
    }
}
