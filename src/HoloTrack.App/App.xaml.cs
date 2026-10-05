using Microsoft.UI.Xaml;
namespace HoloTrack;
public partial class App : Application
{
    private Window? window;
    private Mutex? instance;
    public App() { InitializeComponent(); UnhandledException += (_, e) => Log(e.Exception.ToString()); }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        instance = new Mutex(true, "Local\\HoloTrack.App.SingleInstance", out var first);
        if (!first) { Exit(); return; }
        window = new MainWindow(); window.Activate();
    }
    internal static void Log(string message)
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HoloTrack");
        Directory.CreateDirectory(folder);
        File.AppendAllText(Path.Combine(folder, "app.log"), $"{DateTimeOffset.Now:O} {message}\n");
    }
}
