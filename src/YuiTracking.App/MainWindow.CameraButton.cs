using Microsoft.UI;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace YuiTracking;

public sealed partial class MainWindow
{
    private static readonly Color[] StartColors = { ColorHelper.FromArgb(255, 31, 138, 76), ColorHelper.FromArgb(255, 38, 160, 90), ColorHelper.FromArgb(255, 25, 115, 63) };
    private static readonly Color[] StopColors = { ColorHelper.FromArgb(255, 196, 43, 49), ColorHelper.FromArgb(255, 220, 58, 64), ColorHelper.FromArgb(255, 165, 35, 40) };
    private readonly SolidColorBrush trackRest = new(), trackHover = new(), trackPressed = new();

    // The button template reads these brushes, so changing their color also recolors hover and press.
    private void InitializeCameraButtonColors()
    {
        var text = new SolidColorBrush(Colors.White);
        foreach (var (state, brush) in new[] { ("", trackRest), ("PointerOver", trackHover), ("Pressed", trackPressed) })
        {
            TrackButton.Resources["ButtonBackground" + state] = brush;
            TrackButton.Resources["ButtonBorderBrush" + state] = brush;
            TrackButton.Resources["ButtonForeground" + state] = text;
        }
        SetCameraButtonColor(false);
    }

    private void SetCameraButtonColor(bool isTracking)
    {
        var colors = isTracking ? StopColors : StartColors;
        trackRest.Color = colors[0];
        trackHover.Color = colors[1];
        trackPressed.Color = colors[2];
    }
}
