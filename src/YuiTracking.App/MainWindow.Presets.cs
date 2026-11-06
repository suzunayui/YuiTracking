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
        foreach (var (button, preset) in presetButtons) button.IsChecked = MotionPresets.Matches(preset, SelectedGazeMode, values, disabledSliders, HandTracking.IsChecked == true);
    }

    private void RebuildPresetButtons()
    {
        PresetBar.Children.Clear();
        presetButtons.Clear();
        foreach (var preset in presets)
        {
            var button = new ToggleButton { Content = preset.Name, Padding = new Thickness(10, 3, 10, 4), FontSize = 12, MinWidth = 0 };
            AutomationProperties.SetName(button, "プリセット：" + preset.Name);
            ToolTipService.SetToolTip(button, "押すとこの動きの調整に切り替えます。");
            button.Click += (_, _) => ApplyPreset(preset);
            var gear = new Button { Content = new FontIcon { Glyph = "\uE713", FontSize = 12 }, Padding = new Thickness(6, 3, 6, 4), MinWidth = 0, VerticalAlignment = VerticalAlignment.Stretch };
            AutomationProperties.SetName(gear, preset.Name + "の設定");
            ToolTipService.SetToolTip(gear, "上書き・名前変更・削除");
            gear.Click += async (_, _) => await RunPresetAction(() => ShowPresetActionsAsync(preset));
            var item = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 1 };
            item.Children.Add(button);
            item.Children.Add(gear);
            presetButtons.Add((button, preset));
            PresetBar.Children.Add(item);
        }
        var add = new Button { Content = "＋ 今の設定を保存", Padding = new Thickness(10, 3, 10, 4), FontSize = 12, MinWidth = 0, IsEnabled = presets.Count < MotionPresets.MaximumPresets };
        AutomationProperties.SetName(add, "今の設定をプリセットに保存");
        ToolTipService.SetToolTip(add, "今の動きの調整に名前を付けて保存します。");
        add.Click += async (_, _) => await RunPresetAction(AddPresetAsync);
        PresetBar.Children.Add(add);
        var import = new Button { Content = "インポート", Padding = new Thickness(10, 3, 10, 4), FontSize = 12, MinWidth = 0, IsEnabled = presets.Count < MotionPresets.MaximumPresets };
        AutomationProperties.SetName(import, "プリセットをインポート");
        ToolTipService.SetToolTip(import, "エクスポートしたプリセットのファイルを追加します。");
        import.Click += async (_, _) => await RunPresetAction(() => { ImportPreset(); return Task.CompletedTask; });
        PresetBar.Children.Add(import);
        var export = new Button { Content = "エクスポート", Padding = new Thickness(10, 3, 10, 4), FontSize = 12, MinWidth = 0, IsEnabled = presets.Count > 0 };
        AutomationProperties.SetName(export, "プリセットをエクスポート");
        ToolTipService.SetToolTip(export, "プリセットを選んで、ファイルに保存します。");
        export.Click += async (_, _) => await RunPresetAction(ChoosePresetToExportAsync);
        PresetBar.Children.Add(export);
        UpdatePresetSelection();
    }

    private async Task ShowPresetActionsAsync(MotionPreset preset)
    {
        if (presetDialogOpen || vrmDialogOpen) return;
        presetDialogOpen = true;
        Func<Task>? chosen = null;
        try
        {
            var content = new StackPanel { Spacing = 8, Width = 280 };
            var dialog = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, RequestedTheme = ElementTheme.Dark, Title = preset.Name, Content = content,
                CloseButtonText = "閉じる", DefaultButton = ContentDialogButton.Close
            };
            void Add(string text, Func<Task> action)
            {
                var button = new Button { Content = text, HorizontalAlignment = HorizontalAlignment.Stretch };
                // A second ContentDialog cannot open until this one has closed.
                button.Click += (_, _) => { chosen = action; dialog.Hide(); };
                content.Children.Add(button);
            }
            Add("今の設定で上書き", () => { SavePresets(MotionPresets.Overwritten(presets, preset.Name, SelectedGazeMode, CurrentPresetValues(), disabledSliders.ToList(), HandTracking.IsChecked == true)); return Task.CompletedTask; });
            Add("名前を変更…", () => RenamePresetAsync(preset));
            Add("削除", () => { SavePresets(MotionPresets.Without(presets, preset.Name)); return Task.CompletedTask; });
            await dialog.ShowAsync();
        }
        finally { presetDialogOpen = false; }
        if (chosen != null) await chosen();
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
        if (preset.HandTracking is bool handTracking) { HandTracking.IsChecked = handTracking; ApplyHandTracking(); }
        SetDisabledSliders(preset.Disabled ?? new List<string>());
    }

    private void SavePresets(IReadOnlyList<MotionPreset> updated)
    {
        AppSettings.SaveMotionPresets(updated);
        presets = updated;
        RebuildPresetButtons();
    }

    private void ShowPresetStatus(string text)
    {
        TrackingStatus.Text = text;
        temporaryStatus = text;
        temporaryStatusExpires = Environment.TickCount64 + 3000;
    }

    private async Task ChoosePresetToExportAsync()
    {
        if (presetDialogOpen || vrmDialogOpen) return;
        presetDialogOpen = true;
        MotionPreset? chosen = null;
        try
        {
            var list = new StackPanel { Spacing = 8 };
            var dialog = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, RequestedTheme = ElementTheme.Dark, Title = "エクスポートするプリセット",
                Content = new ScrollViewer { Content = list, MaxHeight = 360, Width = 280 },
                CloseButtonText = "閉じる", DefaultButton = ContentDialogButton.Close
            };
            foreach (var preset in presets)
            {
                var button = new Button { Content = preset.Name, HorizontalAlignment = HorizontalAlignment.Stretch };
                button.Click += (_, _) => { chosen = preset; dialog.Hide(); };
                list.Children.Add(button);
            }
            await dialog.ShowAsync();
        }
        finally { presetDialogOpen = false; }
        if (chosen != null) ExportPreset(chosen);
    }

    private void ExportPreset(MotionPreset preset)
    {
        using var picker = AppFilePicker.ForSaving(PresetFile.FileName(preset.Name), "YuiTracking preset", "*.json", "json", "プリセットをエクスポート");
        var file = picker.Show(WinRT.Interop.WindowNative.GetWindowHandle(this));
        if (file == null) return;
        File.WriteAllText(file, PresetFile.Serialized(preset), new System.Text.UTF8Encoding(false));
        ShowPresetStatus("プリセットをエクスポートしました。");
    }

    private void ImportPreset()
    {
        using var picker = AppFilePicker.ForOpening("YuiTracking preset", "*.json", "プリセットをインポート");
        var file = picker.Show(WinRT.Interop.WindowNative.GetWindowHandle(this));
        if (file == null) return;
        if (new FileInfo(file).Length > PresetFile.MaximumBytes) throw new InvalidDataException("プリセットのファイルとして読み込めません。");
        var preset = PresetFile.Parsed(File.ReadAllText(file));
        var values = preset.Values.Where(item => presetSliders.ContainsKey(item.Key)).ToDictionary(item => item.Key, item => Math.Clamp(item.Value, presetSliders[item.Key].Minimum, presetSliders[item.Key].Maximum));
        SavePresets(MotionPresets.Added(presets, preset with { Name = PresetFile.UniqueName(presets, preset.Name), Values = values }));
        ShowPresetStatus("プリセットをインポートしました。");
    }

    private async Task AddPresetAsync()
    {
        var name = await AskPresetNameAsync("プリセットを保存", MotionPresets.NextName(presets), null);
        if (name != null) SavePresets(MotionPresets.Added(presets, new MotionPreset(name, SelectedGazeMode, CurrentPresetValues(), disabledSliders.ToList(), HandTracking.IsChecked == true)));
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
