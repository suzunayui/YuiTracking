using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using YuiTracking;
namespace CameraPickerUiSmoke;
public partial class App : Application
{
 private Window? window;
 public App() { InitializeComponent(); }
 protected override void OnLaunched(LaunchActivatedEventArgs args)
 {
  window = new Window { Title = "YuiTracking Camera Picker UI Test" };
  var choices = new CameraChoices();
  choices.UpdateNative(new[] { new CameraChoices.Item("capture-native", "Elgato HD60 X", true), new CameraChoices.Item("usb-native", "USB 2.0 Camera", true) });
  var combo = new ComboBox { DisplayMemberPath = "Label", HorizontalAlignment = HorizontalAlignment.Stretch, MaxDropDownHeight = 320 };
  var presenter = new CameraChoicePresenter(combo, choices);presenter.Refresh();
  var state = new TextBlock { TextWrapping = TextWrapping.Wrap };
  var selection = new TextBlock { Text = "選択：Elgato HD60 X" };
  var verdict = new TextBlock { Text = "▼を開くと10回の候補更新を発生させます。" };
  var panel = new StackPanel { Spacing = 12, Padding = new Thickness(28), Width = 480, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top, RequestedTheme = ElementTheme.Dark };
  panel.Children.Add(new TextBlock { Text = "本番と同じカメラ一覧部品の操作テスト" });panel.Children.Add(combo);panel.Children.Add(state);panel.Children.Add(selection);panel.Children.Add(verdict);
  var timer = panel.DispatcherQueue.CreateTimer();timer.Interval = TimeSpan.FromMilliseconds(150);
  int ticks = 0, round = 0;object? initial = null;bool failed = false;
  combo.DropDownOpened += (_, _) => { ticks = 0;round++;initial = combo.ItemsSource;timer.Start(); };
  timer.Tick += (_, _) =>
  {
   ticks++;
   if(ticks >= 5) choices.UpdateBrowser(new[] { new CameraChoices.Item("usb-browser-" + round, "USB 2.0 Camera (0411:02da)") });
   presenter.Refresh();
   failed |= !combo.IsDropDownOpen || !ReferenceEquals(initial, combo.ItemsSource);
   state.Text = $"更新回数：{ticks} / 開いたまま：{combo.IsDropDownOpen} / 元の候補を保持：{ReferenceEquals(initial, combo.ItemsSource)}";
   if(ticks >= 10) { timer.Stop();verdict.Text = failed ? "FAIL popup or ItemsSource changed" : "PASS 10回更新後も一覧が開いたまま、候補を維持"; }
  };
  combo.SelectionChanged += (_, _) => { if(combo.SelectedItem is CameraChoices.Item item) selection.Text = $"選択：{item.Label} / ID：{item.Id}"; };
  combo.DropDownClosed += (_, _) => { timer.Stop();var item = (CameraChoices.Item?)combo.SelectedItem;state.Text = $"閉じた後の候補：{combo.Items.Count} / ID：{item?.Id}"; };
  window.Content = panel;window.Activate();
 }
}
