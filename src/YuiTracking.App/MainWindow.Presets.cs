using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;

namespace YuiTracking;

public sealed partial class MainWindow
{
    private IReadOnlyList<MotionPreset> presets = Array.Empty<MotionPreset>();
    private Dictionary<string, Slider> presetSliders = new();
    private readonly List<(ToggleButton Button, MotionPreset Preset)> presetButtons = new();
    private bool presetDialogOpen;

    private void InitializePresets()
    {
        presetSliders = new Dictionary<string, Slider>
        {
            ["gazeStrength"] = GazeStrength, ["gazeRange"] = GazeRange, ["smoothing"] = Smoothness, ["sensitivity"] = Sensitivity,
            ["mouthOpenStrength"] = MouthStrength, ["mouthSensitivity"] = MouthSensitivity, ["springStrength"] = SpringStrength,
            ["chestSpringStrength"] = ChestSpringStrength, ["bodyStrength"] = BodyStrength, ["forwardLeanStrength"] = ForwardLeanStrength,
            ["backwardLeanStrength"] = BackwardLeanStrength, ["sideTiltStrength"] = SideTiltStrength, ["nearZoomStrength"] = NearZoomStrength,
            ["farZoomStrength"] = FarZoomStrength, ["zoomCenterX"] = ZoomCenterX, ["zoomCenterY"] = ZoomCenterY
        };
        foreach (var slider in presetSliders.Values) slider.ValueChanged += (_, _) => UpdatePresetSelection();
        GazeMode.SelectionChanged += (_, _) => UpdatePresetSelection();
        try { presets = AppSettings.MotionPresets; } catch (Exception ex) { App.Log(ex.Message); }
        RebuildPresetButtons();
    }

    private Dictionary<string, double> CurrentPresetValues() => presetSliders.ToDictionary(item => item.Key, item => Math.Round(item.Value.Value, 6));

    private void UpdatePresetSelection()
    {
        var values = CurrentPresetValues();
        foreach (var (button, preset) in presetButtons) button.IsChecked = MotionPresets.Matches(preset, SelectedGazeMode, values);
    }

    private void RebuildPresetButtons()
    {
        PresetBar.Children.Clear();
        presetButtons.Clear();
        foreach (var preset in presets)
        {
            var button = new ToggleButton { Content = preset.Name, Padding = new Thickness(10, 3, 10, 4), FontSize = 12, MinWidth = 0 };
            AutomationProperties.SetName(button, "プリセット：" + preset.Name);
            ToolTipService.SetToolTip(button, "押すとこの動きの調整に切り替えます。\n右クリックで上書き・名前変更・削除ができます。");
            button.Click += (_, _) => ApplyPreset(preset);
            var menu = new MenuFlyout();
            menu.Items.Add(PresetMenuItem("今の設定で上書き", () => { SavePresets(MotionPresets.Overwritten(presets, preset.Name, SelectedGazeMode, CurrentPresetValues())); return Task.CompletedTask; }));
            menu.Items.Add(PresetMenuItem("名前を変更…", () => RenamePresetAsync(preset)));
            menu.Items.Add(new MenuFlyoutSeparator());
            menu.Items.Add(PresetMenuItem("削除", () => { SavePresets(MotionPresets.Without(presets, preset.Name)); return Task.CompletedTask; }));
            button.ContextFlyout = menu;
            presetButtons.Add((button, preset));
            PresetBar.Children.Add(button);
        }
        var add = new Button { Content = "＋ 今の設定を保存", Padding = new Thickness(10, 3, 10, 4), FontSize = 12, MinWidth = 0, IsEnabled = presets.Count < MotionPresets.MaximumPresets };
        AutomationProperties.SetName(add, "今の設定をプリセットに保存");
        ToolTipService.SetToolTip(add, "今の動きの調整に名前を付けて保存します。");
        add.Click += async (_, _) => await RunPresetAction(AddPresetAsync);
        PresetBar.Children.Add(add);
        UpdatePresetSelection();
    }

    private MenuFlyoutItem PresetMenuItem(string text, Func<Task> action)
    {
        var item = new MenuFlyoutItem { Text = text };
        item.Click += async (_, _) => await RunPresetAction(action);
        return item;
    }

    private async Task RunPresetAction(Func<Task> action)
    {
        try { await action(); }
        catch (Exception ex) { Report(ex); }
    }

    private void ApplyPreset(MotionPreset preset)
    {
        foreach (var (key, value) in preset.Values)
            if (presetSliders.TryGetValue(key, out var slider)) slider.Value = Math.Clamp(value, slider.Minimum, slider.Maximum);
        foreach (var item in GazeMode.Items)
            if (item is ComboBoxItem { Tag: string tag } choice && tag == preset.GazeMode) GazeMode.SelectedItem = choice;
        UpdatePresetSelection();
    }

    private void SavePresets(IReadOnlyList<MotionPreset> updated)
    {
        AppSettings.SaveMotionPresets(updated);
        presets = updated;
        RebuildPresetButtons();
    }

    private async Task AddPresetAsync()
    {
        var name = await AskPresetNameAsync("プリセットを保存", MotionPresets.NextName(presets), null);
        if (name != null) SavePresets(MotionPresets.Added(presets, new MotionPreset(name, SelectedGazeMode, CurrentPresetValues())));
    }

    private async Task RenamePresetAsync(MotionPreset preset)
    {
        var name = await AskPresetNameAsync("名前を変更", preset.Name, preset.Name);
        if (name != null) SavePresets(MotionPresets.Renamed(presets, preset.Name, name));
    }

    private async Task<string?> AskPresetNameAsync(string title, string initial, string? currentName)
    {
        if (presetDialogOpen || vrmDialogOpen) return null;
        presetDialogOpen = true;
        try
        {
            var box = new TextBox { Text = initial, MaxLength = MotionPresets.MaximumNameLength, Header = "名前" };
            box.SelectAll();
            var problem = new TextBlock { FontSize = 12, Foreground = new SolidColorBrush(ColorHelper.FromArgb(255, 255, 150, 150)), TextWrapping = TextWrapping.Wrap };
            var content = new StackPanel { Spacing = 6, Width = 320 };
            content.Children.Add(box);
            content.Children.Add(problem);
            var dialog = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, RequestedTheme = ElementTheme.Dark, Title = title, Content = content,
                PrimaryButtonText = "保存", CloseButtonText = "キャンセル", DefaultButton = ContentDialogButton.Primary
            };
            void Validate()
            {
                var message = MotionPresets.NameProblem(presets, box.Text, currentName);
                problem.Text = message ?? "";
                dialog.IsPrimaryButtonEnabled = message == null;
            }
            box.TextChanged += (_, _) => Validate();
            Validate();
            return await dialog.ShowAsync() == ContentDialogResult.Primary ? box.Text.Trim() : null;
        }
        finally { presetDialogOpen = false; }
    }
}
