using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Windows.Globalization.NumberFormatting;

namespace YuiTracking;

public sealed partial class MainWindow
{
    // Call before saved settings load, so each slider's XAML value becomes its reset value.
    private void AddSliderControls()
    {
        AddSliderControls(GazeStrengthLabel, GazeStrength);
        AddSliderControls(GazeRangeLabel, GazeRange);
        AddSliderControls(SmoothnessLabel, Smoothness, scale: 100, digits: 0);
        AddSliderControls(SensitivityLabel, Sensitivity);
        AddSliderControls(MouthStrengthLabel, MouthStrength);
        AddSliderControls(MouthSensitivityLabel, MouthSensitivity);
        AddSliderControls(SpringStrengthLabel, SpringStrength);
        AddSliderControls(ChestSpringStrengthLabel, ChestSpringStrength);
        AddSliderControls(BodyStrengthLabel, BodyStrength);
        AddSliderControls(ForwardLeanStrengthLabel, ForwardLeanStrength);
        AddSliderControls(BackwardLeanStrengthLabel, BackwardLeanStrength);
        AddSliderControls(NearZoomStrengthLabel, NearZoomStrength);
        AddSliderControls(FarZoomStrengthLabel, FarZoomStrength);
        AddSliderControls(ZoomCenterXLabel, ZoomCenterX, step: 1);
        AddSliderControls(ZoomCenterYLabel, ZoomCenterY, step: 1);
    }

    private void AddSliderControls(TextBlock label, Slider slider, double scale = 1, int digits = 1, double? step = null)
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

        var head = new Grid { ColumnSpacing = 6 };
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        label.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(label);
        Grid.SetColumn(reset, 1);
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
