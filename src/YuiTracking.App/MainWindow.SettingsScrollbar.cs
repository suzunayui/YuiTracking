using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Input;

namespace YuiTracking;

public sealed partial class MainWindow
{
    private double settingsThumbGrab = -1;

    // The standard bar hides itself and shrinks when idle, so the settings panel draws its own.
    private void InitializeSettingsScrollbar()
    {
        SettingsScroll.ViewChanged += (_, _) => UpdateSettingsScrollbar();
        SettingsScroll.SizeChanged += (_, _) => UpdateSettingsScrollbar();
        SettingsList.SizeChanged += (_, _) => UpdateSettingsScrollbar();
        SettingsScrollTrack.SizeChanged += (_, _) => UpdateSettingsScrollbar();
        SettingsScrollTrack.PointerPressed += SettingsScrollTrack_PointerPressed;
        SettingsScrollTrack.PointerMoved += SettingsScrollTrack_PointerMoved;
        SettingsScrollTrack.PointerReleased += SettingsScrollTrack_PointerEnded;
        SettingsScrollTrack.PointerCaptureLost += SettingsScrollTrack_PointerEnded;
        SettingsScrollTrack.PointerWheelChanged += (_, e) =>
        {
            var delta = e.GetCurrentPoint(SettingsScrollTrack).Properties.MouseWheelDelta;
            SettingsScroll.ChangeView(null, SettingsScroll.VerticalOffset - delta, null, true);
            e.Handled = true;
        };
    }

    private void UpdateSettingsScrollbar()
    {
        var track = SettingsScrollTrack.ActualHeight;
        var viewport = SettingsScroll.ViewportHeight;
        var extent = SettingsScroll.ExtentHeight;
        var canScroll = ScrollThumbMath.CanScroll(viewport, extent) && track > 0;
        SettingsScrollThumb.Visibility = canScroll ? Visibility.Visible : Visibility.Collapsed;
        if (!canScroll) return;
        SettingsScrollThumb.Height = ScrollThumbMath.ThumbHeight(track, viewport, extent);
        SettingsScrollThumb.Margin = new Thickness(0, ScrollThumbMath.ThumbTop(SettingsScroll.VerticalOffset, track, viewport, extent), 0, 0);
    }

    private void SettingsScrollTrack_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (SettingsScrollThumb.Visibility != Visibility.Visible) return;
        var y = e.GetCurrentPoint(SettingsScrollTrack).Position.Y;
        var top = SettingsScrollThumb.Margin.Top;
        var height = SettingsScrollThumb.Height;
        // Dragging keeps the grabbed point under the pointer; a track click centers the thumb there.
        settingsThumbGrab = y >= top && y <= top + height ? y - top : height / 2;
        SettingsScrollTrack.CapturePointer(e.Pointer);
        ScrollSettingsTo(y);
        e.Handled = true;
    }

    private void SettingsScrollTrack_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (settingsThumbGrab < 0) return;
        ScrollSettingsTo(e.GetCurrentPoint(SettingsScrollTrack).Position.Y);
        e.Handled = true;
    }

    private void SettingsScrollTrack_PointerEnded(object sender, PointerRoutedEventArgs e)
    {
        settingsThumbGrab = -1;
        SettingsScrollTrack.ReleasePointerCapture(e.Pointer);
    }

    private void ScrollSettingsTo(double pointerY)
    {
        var offset = ScrollThumbMath.OffsetFromThumbTop(pointerY - settingsThumbGrab, SettingsScrollTrack.ActualHeight, SettingsScroll.ViewportHeight, SettingsScroll.ExtentHeight);
        SettingsScroll.ChangeView(null, offset, null, true);
    }
}
