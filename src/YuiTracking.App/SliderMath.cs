namespace YuiTracking;

internal static class SliderMath
{
    // Rounding removes binary drift such as 1.2000000000000002 after repeated steps.
    internal static double Step(double value, double delta, double minimum, double maximum) =>
        Math.Clamp(Math.Round(value + delta, 6), minimum, maximum);

    internal static double FromDisplay(double display, double scale, double minimum, double maximum) =>
        Math.Clamp(Math.Round(display / scale, 6), minimum, maximum);
}
