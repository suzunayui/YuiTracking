using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Windows.Globalization.NumberFormatting;

namespace YuiTracking;

public sealed partial class MainWindow
{
    private HashSet<string> disabledSliders = new();
    private readonly Dictionary<string, (string Key, double Off)> sliderOffValues = new();
    private readonly Dictionary<string, Action<bool>> sliderEnabledViews = new();

    // What the renderer receives: a disabled slider sends its neutral value and keeps its own.
    private double Effective(Slider slider) =>
        sliderOffValues.TryGetValue(slider.Name, out var item) && disabledSliders.Contains(item.Key) ? item.Off : slider.Value;

    private void SetDisabledSliders(IEnumerable<string> keys)
    {
        disabledSliders = keys.Where(sliderEnabledViews.ContainsKey).ToHashSet();
        foreach (var (key, show) in sliderEnabledViews) show(!disabledSliders.Contains(key));
        try { AppSettings.SaveDisabledSliders(disabledSliders); } catch (Exception ex) { App.Log(ex.Message); }
        SendSettings();
        UpdatePresetSelection();
    }

    private void HandTracking_Click(object sender, RoutedEventArgs e)
    {
        try { AppSettings.SaveHandTracking(HandTracking.IsChecked == true); } catch (Exception ex) { App.Log(ex.Message); }
        SendSettings();
        ShowHandStatus(null);
    }

    private void ShowHandStatus(string? text)
    {
        if (HandTracking.IsChecked != true) HandDetectionStatus.Text = "手：オフ";
        else HandDetectionStatus.Text = text ?? (tracking ? "手：認識を準備中…" : "手：カメラ停止中");
    }

    // Call before saved settings load, so each slider's XAML value becomes its reset value.
    private void AddSliderControls()
    {
        try { disabledSliders = AppSettings.DisabledSliders.ToHashSet(); } catch (Exception ex) { App.Log(ex.Message); }
        AddSliderControls(GazeStrengthLabel, GazeStrength, "gazeStrength", 1);
        AddSliderControls(GazeRangeLabel, GazeRange, "gazeRange", 1);
        AddSliderControls(SmoothnessLabel, Smoothness, "smoothing", 0, scale: 100, digits: 0);
        AddSliderControls(SensitivityLabel, Sensitivity, "sensitivity", 1);
        AddSliderControls(MouthStrengthLabel, MouthStrength, "mouthOpenStrength", 1);
        AddSliderControls(MouthSensitivityLabel, MouthSensitivity, "mouthSensitivity", 1);
        AddSliderControls(SpringStrengthLabel, SpringStrength, "springStrength", 1);
        AddSliderControls(ChestSpringStrengthLabel, ChestSpringStrength, "chestSpringStrength", 1);
        AddSliderControls(BodyStrengthLabel, BodyStrength, "bodyStrength", 0);
        AddSliderControls(ForwardLeanStrengthLabel, ForwardLeanStrength, "forwardLeanStrength", 0);
        AddSliderControls(BackwardLeanStrengthLabel, BackwardLeanStrength, "backwardLeanStrength", 0);
        AddSliderControls(SideTiltStrengthLabel, SideTiltStrength, "sideTiltStrength", 0);
        AddSliderControls(NearZoomStrengthLabel, NearZoomStrength, "nearZoomStrength", 0);
        AddSliderControls(FarZoomStrengthLabel, FarZoomStrength, "farZoomStrength", 0);
        AddSliderControls(ZoomCenterXLabel, ZoomCenterX, "zoomCenterX", 0, step: 1);
        AddSliderControls(ZoomCenterYLabel, ZoomCenterY, "zoomCenterY", 0, step: 1);
    }

    private void AddSliderControls(TextBlock label, Slider slider, string key, double offValue, double scale = 1, int digits = 1, double? step = null)
    {
        static int IndexOfName(StackPanel owner, string name)
        {
            for (var i = 0; i < owner.Children.Count; i++)
                if (owner.Children[i] is FrameworkElement element && element.Name == name) return i;
            return -1;
        }
        StackPanel? panel = null;
        foreach (var child in SettingsList.Children)
            if (child is StackPanel candidate && IndexOfName(candidate, slider.Name) >= 0 && IndexOfName(candidate, label.Name) >= 0) panel = candidate;
        if (panel == null) throw new InvalidOperationException($"No panel holds {label.Name} and {slider.Name}.");
        var name = label.Text.Split('：')[0];
        var resetValue = slider.Value;
        var stepSize = step ?? slider.StepFrequency;
        var index = IndexOfName(panel, label.Name);
        panel.Children.RemoveAt(IndexOfName(panel, slider.Name));
        panel.Children.RemoveAt(index);

        var box = new NumberBox
        {
            Width = 64, MinWidth = 0, FontSize = 12, VerticalAlignment = VerticalAlignment.Center,
            Minimum = slider.Minimum * scale, Maximum = slider.Maximum * scale, Value = slider.Value * scale,
            SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Hidden,
            ValidationMode = NumberBoxValidationMode.InvalidInputOverwritten,
            NumberFormatter = new DecimalFormatter
            {
                FractionDigits = digits, IntegerDigits = 1,
                NumberRounder = new IncrementNumberRounder { Increment = Math.Pow(10, -digits), RoundingAlgorithm = RoundingAlgorithm.RoundHalfUp }
            }
        };
        AutomationProperties.SetName(box, name + "の数値");
        ToolTipService.SetToolTip(box, $"数値を直接入力できます（{slider.Minimum * scale:0.#}〜{slider.Maximum * scale:0.#}）。");
        var minus = StepButton("−", name + "を下げる", -stepSize, slider);
        var plus = StepButton("＋", name + "を上げる", stepSize, slider);
        var reset = new Button
        {
            Content = new FontIcon { Glyph = "", FontSize = 12 },
            Width = 26, Height = 24, Padding = new Thickness(0), MinWidth = 0, MinHeight = 0, VerticalAlignment = VerticalAlignment.Center
        };
        AutomationProperties.SetName(reset, name + "を初期値に戻す");
        ToolTipService.SetToolTip(reset, $"初期値（{resetValue * scale:0.#}）に戻します。");
        reset.Click += (_, _) => slider.Value = resetValue;

        var updating = false;
        slider.ValueChanged += (_, e) =>
        {
            if (updating) return;
            updating = true;
            box.Value = e.NewValue * scale;
            updating = false;
        };
        box.ValueChanged += (_, e) =>
        {
            if (updating) return;
            updating = true;
            if (double.IsNaN(e.NewValue)) box.Value = slider.Value * scale;
            else slider.Value = SliderMath.FromDisplay(e.NewValue, scale, slider.Minimum, slider.Maximum);
            updating = false;
        };
        void SyncEnabled() => box.IsEnabled = minus.IsEnabled = plus.IsEnabled = reset.IsEnabled = slider.IsEnabled;
        slider.RegisterPropertyChangedCallback(Control.IsEnabledProperty, (_, _) => SyncEnabled());
        SyncEnabled();

        var enabled = new CheckBox { MinWidth = 0, Width = 22, MinHeight = 0, Height = 24, Padding = new Thickness(0), VerticalAlignment = VerticalAlignment.Center, IsChecked = !disabledSliders.Contains(key) };
        AutomationProperties.SetName(enabled, name + "を使う");
        ToolTipService.SetToolTip(enabled, "外すとこの機能を止めます。値は覚えていて、入れ直すと戻ります。");
        var head = new Grid { ColumnSpacing = 6 };
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        label.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(enabled);
        Grid.SetColumn(label, 1);
        head.Children.Add(label);
        Grid.SetColumn(reset, 2);
        head.Children.Add(reset);

        var row = new Grid { ColumnSpacing = 4 };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        slider.VerticalAlignment = VerticalAlignment.Center;
        row.Children.Add(minus);
        Grid.SetColumn(slider, 1);
        row.Children.Add(slider);
        Grid.SetColumn(plus, 2);
        row.Children.Add(plus);
        Grid.SetColumn(box, 3);
        row.Children.Add(box);

        void ShowEnabled(bool on) { enabled.IsChecked = on; row.Opacity = reset.Opacity = on ? 1 : .4; row.IsHitTestVisible = reset.IsHitTestVisible = on; }
        sliderOffValues[slider.Name] = (key, offValue);
        sliderEnabledViews[key] = ShowEnabled;
        ShowEnabled(!disabledSliders.Contains(key));
        enabled.Click += (_, _) =>
        {
            var next = new HashSet<string>(disabledSliders);
            if (enabled.IsChecked == true) next.Remove(key); else next.Add(key);
            SetDisabledSliders(next);
        };
        panel.Children.Insert(index, head);
        panel.Children.Insert(index + 1, row);
    }

    private static RepeatButton StepButton(string text, string automationName, double delta, Slider slider)
    {
        var button = new RepeatButton
        {
            Content = text, Width = 26, Height = 26, Padding = new Thickness(0), MinWidth = 0, MinHeight = 0, FontSize = 12,
            Delay = 400, Interval = 100, VerticalAlignment = VerticalAlignment.Center
        };
        AutomationProperties.SetName(button, automationName);
        button.Click += (_, _) => slider.Value = SliderMath.Step(slider.Value, delta, slider.Minimum, slider.Maximum);
        return button;
    }
}
