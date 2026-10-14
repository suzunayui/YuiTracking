using Microsoft.UI.Xaml;
namespace YuiTracking;
public partial class App : Application
{
    private Window? window;
    private Mutex? instance;
    private Mutex? legacyInstance;
    public App() { InitializeComponent(); UnhandledException += (_, e) => Log(e.Exception.ToString()); }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        instance = new Mutex(true, "Local\\YuiTracking.App.SingleInstance", out var first);
        if (!first) { Exit(); return; }
        // Prevent an installed older version from running alongside this version.
        legacyInstance = new Mutex(true, "Local\\HoloTrack.App.SingleInstance", out var legacyFirst);
        if (!legacyFirst) { Exit(); return; }
        window = new MainWindow(); window.Activate();
    }
    internal static void Log(string message)
    {
        var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking");
        Directory.CreateDirectory(folder);
        var legacyLog = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HoloTrack", "app.log");
        if (!File.Exists(Path.Combine(folder, "app.log")) && File.Exists(legacyLog))
            File.Copy(legacyLog, Path.Combine(folder, "app.log"));
        File.AppendAllText(Path.Combine(folder, "app.log"), $"{DateTimeOffset.Now:O} {message}\n");
    }
}
