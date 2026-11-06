using System.Runtime.InteropServices.WindowsRuntime;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Streams;

namespace YuiTracking;

public sealed partial class MainWindow
{
    private const string PngPrefix = "data:image/png;base64,";
    private const int MaximumCardBytes = 16 * 1024 * 1024;
    private bool settingsCardPending;

    private void SettingsCard_Click(object sender, RoutedEventArgs e)
    {
        if (!ready) return;
        settingsCardPending = true;
        Send(new { type = "settingsCard", card = BuildSettingsCard() });
    }

    private object BuildSettingsCard()
    {
        object Row(TextBlock label, string key)
        {
            var parts = (label.Text ?? "").Split('：', 2);
            return new { label = parts[0], value = parts.Length > 1 ? parts[1] : "", off = disabledSliders.Contains(key) };
        }
        object Section(string title, params object[] rows) => new { title, rows };
        var preset = presetButtons.FirstOrDefault(item => item.Button.IsChecked == true).Preset?.Name;
        return new
        {
            title = "YuiTracking の設定",
            preset = preset == null ? null : "プリセット：" + preset,
            sections = new[]
            {
                Section("目線", new { label = "目線モード", value = (GazeMode.SelectedItem as ComboBoxItem)?.Content as string ?? "", off = false }, Row(GazeStrengthLabel, "gazeStrength"), Row(GazeRangeLabel, "gazeRange")),
                Section("顔・口", Row(SmoothnessLabel, "smoothing"), Row(SensitivityLabel, "sensitivity"), Row(MouthStrengthLabel, "mouthOpenStrength"), Row(MouthSensitivityLabel, "mouthSensitivity")),
                Section("揺れ", Row(SpringStrengthLabel, "springStrength"), Row(ChestSpringStrengthLabel, "chestSpringStrength")),
                Section("体", Row(BodyStrengthLabel, "bodyStrength"), Row(ForwardLeanStrengthLabel, "forwardLeanStrength"), Row(BackwardLeanStrengthLabel, "backwardLeanStrength"), Row(SideTiltStrengthLabel, "sideTiltStrength")),
                Section("手", new { label = "手のトラッキング", value = HandTracking.IsChecked == true ? "オン" : "オフ", off = false }),
                Section("ズーム", Row(NearZoomStrengthLabel, "nearZoomStrength"), Row(FarZoomStrengthLabel, "farZoomStrength"), Row(ZoomCenterXLabel, "zoomCenterX"), Row(ZoomCenterYLabel, "zoomCenterY"))
            }
        };
    }

    private async Task SaveSettingsCardAsync(string? dataUrl)
    {
        if (!settingsCardPending) return;
        settingsCardPending = false;
        var bytes = DecodeCard(dataUrl);
        var copied = false;
        try { await CopyImageAsync(bytes); copied = true; }
        catch (Exception ex) { App.Log(ex.ToString()); }
        using var picker = AppFilePicker.ForSaving("YuiTracking-設定.png", "PNG", "*.png", "png", "設定を画像で保存");
        var file = picker.Show(WinRT.Interop.WindowNative.GetWindowHandle(this));
        if (file != null) await File.WriteAllBytesAsync(file, bytes);
        ShowPresetStatus(file != null
            ? (copied ? "設定の画像を保存して、コピーしました。" : "設定の画像を保存しました。")
            : (copied ? "設定の画像をコピーしました。" : "設定の画像をコピーできませんでした。"));
    }

    private static byte[] DecodeCard(string? dataUrl)
    {
        if (dataUrl == null || !dataUrl.StartsWith(PngPrefix, StringComparison.Ordinal) || dataUrl.Length > MaximumCardBytes) throw new InvalidDataException("設定の画像を作れませんでした。");
        var bytes = Convert.FromBase64String(dataUrl[PngPrefix.Length..]);
        if (bytes.Length < 8 || bytes[0] != 0x89 || bytes[1] != 0x50 || bytes[2] != 0x4E || bytes[3] != 0x47) throw new InvalidDataException("設定の画像を作れませんでした。");
        return bytes;
    }

    private static async Task CopyImageAsync(byte[] bytes)
    {
        var stream = new InMemoryRandomAccessStream();
        await stream.WriteAsync(bytes.AsBuffer());
        stream.Seek(0);
        var package = new DataPackage();
        package.SetBitmap(RandomAccessStreamReference.CreateFromStream(stream));
        Clipboard.SetContent(package);
        Clipboard.Flush();
    }
}
