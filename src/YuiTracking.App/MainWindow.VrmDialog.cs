using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace YuiTracking;

public sealed partial class MainWindow
{
    private bool vrmDialogOpen;

    private async void OpenModel_Click(object sender, RoutedEventArgs e)
    {
        if (!ready || vrmDialogOpen) return;
        vrmDialogOpen = true;
        try
        {
            string? selected = null;
            var cards = new VariableSizedWrapGrid { Orientation = Orientation.Horizontal, ItemWidth = 200, ItemHeight = 158, MaximumRowsOrColumns = 3 };
            var dialog = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, RequestedTheme = ElementTheme.Dark, Title = "VRMを選ぶ",
                PrimaryButtonText = "ファイルから開く…", CloseButtonText = "閉じる", DefaultButton = ContentDialogButton.Primary,
                Content = new ScrollViewer { Content = cards, MaxHeight = 500, Width = 620, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }
            };
            dialog.Resources["ContentDialogMaxWidth"] = 700d;
            async Task Refresh()
            {
                cards.Children.Clear();
                var history = AppSettings.VrmHistory;
                if (history.Count == 0)
                {
                    var empty = new TextBlock { Text = "まだ読み込んだVRMはありません。\n「ファイルから開く」で読み込むと、ここに並びます。", Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 157, 167, 192)) };
                    VariableSizedWrapGrid.SetColumnSpan(empty, 3);
                    cards.Children.Add(empty);
                    return;
                }
                foreach (var path in history)
                    cards.Children.Add(await CreateVrmCardAsync(path,
                        () => { selected = path; dialog.Hide(); },
                        async () => { AppSettings.RemoveVrmFromHistory(path); await Refresh(); }));
            }
            await Refresh();
            var result = await dialog.ShowAsync();
            if (selected != null) await LoadModelAsync(selected);
            else if (result == ContentDialogResult.Primary) await OpenVrmFileAsync();
        }
        catch (Exception ex) { Report(ex); }
        finally { vrmDialogOpen = false; }
    }

    private async Task OpenVrmFileAsync()
    {
        string? lastVrm = null;
        try { lastVrm = AppSettings.DefaultVrmPath; } catch (Exception ex) { App.Log(ex.Message); }
        using var picker = new VrmFilePicker(VrmFilePicker.InitialFolder(currentVrmPath, lastVrm));
        var file = picker.Show(WinRT.Interop.WindowNative.GetWindowHandle(this));
        if (file != null) await LoadModelAsync(file);
    }

    private async Task<FrameworkElement> CreateVrmCardAsync(string path, Action select, Func<Task> remove)
    {
        var name = Path.GetFileNameWithoutExtension(path);
        var exists = File.Exists(path);
        var current = string.Equals(path, currentVrmPath, StringComparison.OrdinalIgnoreCase);
        var picture = new Grid { Height = 104, Background = new SolidColorBrush(ColorHelper.FromArgb(255, 16, 18, 27)), CornerRadius = new CornerRadius(4) };
        var thumbnail = AppSettings.VrmThumbnailPath(path);
        if (File.Exists(thumbnail))
        {
            var source = new BitmapImage();
            using (var stream = File.OpenRead(thumbnail).AsRandomAccessStream()) await source.SetSourceAsync(stream);
            picture.Children.Add(new Image { Source = source, Stretch = Stretch.Uniform });
        }
        else
        {
            picture.Children.Add(new TextBlock { Text = "画像なし", FontSize = 12, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center, Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 157, 167, 192)) });
        }
        var content = new StackPanel { Spacing = 4 };
        content.Children.Add(picture);
        content.Children.Add(new TextBlock { Text = name, FontSize = 12, TextTrimming = TextTrimming.CharacterEllipsis });
        var button = new Button
        {
            Content = content, HorizontalAlignment = HorizontalAlignment.Stretch, VerticalAlignment = VerticalAlignment.Stretch,
            HorizontalContentAlignment = HorizontalAlignment.Stretch, VerticalContentAlignment = VerticalAlignment.Top,
            Padding = new Thickness(6), IsEnabled = exists
        };
        if (current) { button.BorderBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 66, 197, 255)); button.BorderThickness = new Thickness(2); }
        AutomationProperties.SetName(button, name + (current ? "（使用中）" : exists ? "" : "（見つかりません）"));
        ToolTipService.SetToolTip(button, exists ? path : "ファイルが見つかりません：" + path);
        button.Click += (_, _) => select();
        var removeButton = new Button
        {
            Content = new FontIcon { Glyph = "", FontSize = 10 }, Width = 24, Height = 24, Padding = new Thickness(0), MinWidth = 0, MinHeight = 0,
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 4, 4, 0)
        };
        AutomationProperties.SetName(removeButton, name + "を一覧から外す");
        ToolTipService.SetToolTip(removeButton, "一覧から外します。VRMファイルは消えません。");
        removeButton.Click += async (_, _) => { try { await remove(); } catch (Exception ex) { Report(ex); } };
        var card = new Grid { Margin = new Thickness(0, 0, 8, 8) };
        card.Children.Add(button);
        card.Children.Add(removeButton);
        if (!exists || current)
            card.Children.Add(new Border
            {
                Background = new SolidColorBrush(ColorHelper.FromArgb(230, 23, 27, 39)), CornerRadius = new CornerRadius(4), Padding = new Thickness(6, 2, 6, 2),
                Margin = new Thickness(10), HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top, IsHitTestVisible = false,
                Child = new TextBlock { Text = exists ? "使用中" : "見つかりません", FontSize = 11 }
            });
        return card;
    }

    private void SaveVrmThumbnail(string? dataUrl)
    {
        if (currentVrmPath == null) return;
        var bytes = VrmHistory.DecodeThumbnail(dataUrl);
        if (bytes == null) { App.Log("Ignored an invalid VRM thumbnail."); return; }
        var file = AppSettings.VrmThumbnailPath(currentVrmPath);
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllBytes(file, bytes);
    }
}
