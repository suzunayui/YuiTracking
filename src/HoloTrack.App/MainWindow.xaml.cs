using System.Text;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Storage.Pickers;

namespace HoloTrack;
public sealed partial class MainWindow : Window
{
    private bool ready, tracking, closing;
    private bool restoreOutputPending;
    private VirtualCamera? output;
    private CoreWebView2SharedBuffer? frameBuffer;
    private Stream? frameStream;
    private readonly byte[] frameBytes = new byte[VirtualCamera.FrameBytes];
    private string performanceStatus = "";
    private byte[]? modelBytes;
    private int modelRequestId;
    private string? pendingModelPath;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer statusTimer;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer framingTimer;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer mouthTimer;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer springTimer;
    private bool pendingSpringStrength;
    private void SaveSpringStrength()
    {
        springTimer.Stop();
        if (!pendingSpringStrength) return;
        try { AppSettings.SaveSpringStrength(SpringStrength.Value); pendingSpringStrength = false; }
        catch (Exception ex) { App.Log(ex.Message); }
    }
    private bool pendingMouthSettings;
    private void SaveMouthStrength()
    {
        mouthTimer.Stop();
        if (!pendingMouthSettings) return;
        try { AppSettings.SaveMouthSettings(MouthStrength.Value, MouthSensitivity.Value); pendingMouthSettings = false; }
        catch (Exception ex) { App.Log(ex.Message); }
    }
    private AppSettings.Framing? pendingFraming;
    private void SaveFraming()
    {
        framingTimer.Stop();
        if (pendingFraming == null) return;
        try { AppSettings.SaveFraming(pendingFraming); pendingFraming = null; }
        catch (Exception ex) { App.Log(ex.Message); }
    }
    private readonly string assets = Path.Combine(AppContext.BaseDirectory, "Assets", "Renderer");
    public record CameraItem(string Id, string Label);
    public MainWindow()
    {
        InitializeComponent();
        framingTimer = DispatcherQueue.CreateTimer(); framingTimer.Interval = TimeSpan.FromMilliseconds(250);
        framingTimer.Tick += (_, _) => SaveFraming();
        mouthTimer = DispatcherQueue.CreateTimer(); mouthTimer.Interval = TimeSpan.FromMilliseconds(250);
        mouthTimer.Tick += (_, _) => SaveMouthStrength();
        springTimer = DispatcherQueue.CreateTimer(); springTimer.Interval = TimeSpan.FromMilliseconds(250);
        springTimer.Tick += (_, _) => SaveSpringStrength();
        try { SpringStrength.Value = AppSettings.SpringStrength; }
        catch (Exception ex) { App.Log(ex.Message); }
        SpringStrengthLabel.Text = $"揺れものの強さ：{SpringStrength.Value:0.0}倍";
        try { MouthStrength.Value = AppSettings.MouthOpenStrength; MouthSensitivity.Value = AppSettings.MouthSensitivity; }
        catch (Exception ex) { App.Log(ex.Message); }
        MouthStrengthLabel.Text = $"口の開き具合：{MouthStrength.Value:0.0}倍";
        MouthSensitivityLabel.Text = $"口の感度：{MouthSensitivity.Value:0.0}倍";
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "Branding", "YuiTracking.ico"));
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1500, 1040));
        statusTimer = DispatcherQueue.CreateTimer(); statusTimer.Interval = TimeSpan.FromSeconds(1);
        statusTimer.Tick += (_, _) => { if (output != null) OutputStatus.Text = "仮想カメラ：" + output.Status + performanceStatus; };
        statusTimer.Start();
        Root.Loaded += async (_, _) => await InitializeRenderer();
        Closed += (_, _) => { closing = true; SaveFraming(); SaveMouthStrength(); SaveSpringStrength(); output?.Dispose(); statusTimer.Stop(); Viewport.Close(); frameStream?.Dispose(); frameBuffer?.Dispose(); };
    }
    private async Task InitializeRenderer()
    {
        try
        {
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HoloTrack", "WebView");
            var options = new CoreWebView2EnvironmentOptions { AdditionalBrowserArguments = "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows" };
            var env = await CoreWebView2Environment.CreateWithOptionsAsync(null, profile, options);
            await Viewport.EnsureCoreWebView2Async(env);
            var core = Viewport.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += ResourceRequested;
            core.PermissionRequested += (_, e) =>
            {
                e.State = e.Uri.StartsWith("https://holotrack.local/", StringComparison.Ordinal) && e.PermissionKind == CoreWebView2PermissionKind.Camera
                    ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
                e.SavesInProfile = false;
            };
            core.NavigationStarting += (_, e) => { if (e.Uri != "https://holotrack.local/index.html") e.Cancel = true; };
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.WebMessageReceived += MessageReceived;
            core.ProcessFailed += (_, e) => { ready = false; output?.SetPrivacy(true); TrackingStatus.Text = "描画が停止しました。再起動してください。"; App.Log(e.ProcessFailedKind.ToString()); };
            core.Navigate("https://holotrack.local/index.html");
        }
        catch (Exception ex) { Report(ex); }
    }
    private async void ResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var uri = new Uri(e.Request.Uri);
        if (uri.Scheme == "blob" || uri.Scheme == "data") return;
        if (uri.Host != "holotrack.local") { e.Response = sender.Environment.CreateWebResourceResponse(null,403,"Forbidden",""); return; }
        if (uri.AbsolutePath == "/avatar.vrm")
        {
            e.Response = sender.Environment.CreateWebResourceResponse(modelBytes == null ? null : new MemoryStream(modelBytes).AsRandomAccessStream(), modelBytes == null ? 404 : 200, "OK", "Content-Type: model/gltf-binary\r\nCache-Control: no-store"); return;
        }
        if (uri.AbsolutePath != "/frame")
        {
            // Serve every resource ourselves: virtual-host folder mapping bypasses
            // WebResourceRequested, including dynamic model/frame endpoints.
            var path = Path.GetFullPath(Path.Combine(assets, Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/')));
            if (!path.StartsWith(assets + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
            { e.Response = sender.Environment.CreateWebResourceResponse(null,404,"Not Found",""); return; }
            var mime = Path.GetExtension(path) switch { ".html" => "text/html; charset=utf-8", ".js" => "text/javascript", ".wasm" => "application/wasm", _ => "application/octet-stream" };
            e.Response = sender.Environment.CreateWebResourceResponse(File.OpenRead(path).AsRandomAccessStream(),200,"OK",$"Content-Type: {mime}\r\nCache-Control: no-store"); return;
        }
        using var deferral = e.GetDeferral();
        try
        {
            if (e.Request.Method != "POST" || e.Request.Content == null) throw new InvalidDataException("Invalid frame request.");
            var bytes = new byte[VirtualCamera.FrameBytes];
            using var body = e.Request.Content.AsStreamForRead();
            await body.ReadExactlyAsync(bytes);
            if (body.ReadByte() != -1) throw new InvalidDataException("Oversized frame.");
            if (!closing) output?.Submit(bytes);
            e.Response = sender.Environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("ok")).AsRandomAccessStream(),200,"OK","Content-Type: text/plain\r\nCache-Control: no-store");
        }
        catch (Exception ex) { output?.SetPrivacy(true); App.Log(ex.Message); e.Response = sender.Environment.CreateWebResourceResponse(null,400,"Invalid Frame",""); }
    }
    private async void MessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith("https://holotrack.local/", StringComparison.Ordinal)) return;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson); var root = doc.RootElement;
            switch (root.GetProperty("type").GetString())
            {
                case "ready":
                    ready = true; ModelButton.IsEnabled = TrackButton.IsEnabled = OutputButton.IsEnabled = true;
                    try
                    {
                        frameStream?.Dispose(); frameBuffer?.Dispose();
                        frameBuffer = sender.Environment.CreateSharedBuffer((ulong)VirtualCamera.FrameBytes);
                        frameStream = frameBuffer.OpenStream().AsStream();
                        sender.PostSharedBufferToScript(frameBuffer, CoreWebView2SharedBufferAccess.ReadWrite, "{\"type\":\"avatarFrame\"}");
                        App.Log("Shared-memory frame transport ready");
                    }
                    catch (Exception ex) { frameStream = null; App.Log("Frame transport fallback: " + ex.Message); }
                    TrackingStatus.Text = "準備完了。VRMを開くか、サンプルで動作確認できます。";
                    SendSettings(); App.Log("Renderer ready");
                    restoreOutputPending = AppSettings.VirtualCameraEnabled;
                    var framing = AppSettings.SavedFraming;
                    if (framing != null) Send(new { type = "restoreFraming", zoom = framing.Zoom, x = framing.X, y = framing.Y, z = framing.Z });
                    var defaultModel = AppSettings.DefaultVrmPath;
                    if (!string.IsNullOrWhiteSpace(defaultModel)) await LoadModelAsync(defaultModel);
                    else RestoreOutput();
                    break;
                case "frameReady":
                    try
                    {
                        if (!closing && frameStream != null)
                        { frameStream.Position = 0; frameStream.ReadExactly(frameBytes); output?.Submit(frameBytes); }
                    }
                    finally { Send(new { type = "frameAck" }); }
                    break;
                case "performance":
                    performanceStatus = $"\n描画 {root.GetProperty("renderFps").GetDouble():F1}fps / 新規画像 {root.GetProperty("frameFps").GetDouble():F1}fps";
                    App.Log("Frame performance: " + root.GetRawText());
                    break;
                case "framingChanged":
                    var zoom = root.GetProperty("zoom").GetDouble();
                    var x = root.GetProperty("x").GetDouble(); var y = root.GetProperty("y").GetDouble(); var z = root.GetProperty("z").GetDouble();
                    if (!double.IsFinite(zoom) || zoom < .5 || zoom > 4 || !double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(z)) break;
                    pendingFraming = new(zoom, x, y, z);
                    framingTimer.Stop(); framingTimer.Start();
                    break;
                case "modelLoaded":
                    if (root.GetProperty("requestId").GetInt32() != modelRequestId || pendingModelPath == null) break;
                    ModelLabel.Text = Path.GetFileName(pendingModelPath);
                    App.Log("VRM loaded: " + pendingModelPath);
                    ModelButton.IsEnabled = true;
                    AppSettings.SaveDefaultVrm(pendingModelPath);
                    pendingModelPath = null;
                    RestoreOutput();
                    break;
                case "modelFailed":
                    if (root.GetProperty("requestId").GetInt32() == modelRequestId)
                    { pendingModelPath = null; ModelButton.IsEnabled = true; RestoreOutput(); }
                    break;
                case "status": TrackingStatus.Text = root.GetProperty("text").GetString(); break;
                case "error": TrackingStatus.Text = root.GetProperty("text").GetString(); App.Log(TrackingStatus.Text ?? "Renderer error"); break;
                case "tracking": tracking = root.GetProperty("active").GetBoolean(); TrackButton.Content = tracking ? "カメラを停止" : "カメラを開始"; TrackButton.IsEnabled = true; break;
                case "cameraInput":
                    CameraInputStatus.Text = $"カメラ入力：{root.GetProperty("width").GetInt32()} × {root.GetProperty("height").GetInt32()} / {root.GetProperty("fps").GetDouble():0.#}fps";
                    App.Log("Camera input: " + root.GetRawText());
                    break;
                case "cameras":
                    var selected = (Cameras.SelectedItem as CameraItem)?.Id;
                    var list = root.GetProperty("items").EnumerateArray().Select(c => new CameraItem(c.GetProperty("deviceId").GetString()!, c.GetProperty("label").GetString()!)).ToList();
                    Cameras.ItemsSource = list; Cameras.SelectedItem = list.FirstOrDefault(c => c.Id == selected) ?? list.FirstOrDefault(); break;
            }
        }
        catch (Exception ex) { Report(ex); }
    }
    private void Send(object message) { if (ready) Viewport.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message)); }
    private async void OpenModel_Click(object sender, RoutedEventArgs e)
    {
        if (!ready) return;
        try
        {
            var picker = new FileOpenPicker(); WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
            picker.FileTypeFilter.Add(".vrm"); var file = await picker.PickSingleFileAsync(); if (file == null) return;
            await LoadModelAsync(file.Path);
        }
        catch (Exception ex) { Report(ex); }
    }
    private async Task LoadModelAsync(string path)
    {
        var requestId = ++modelRequestId;
        ModelButton.IsEnabled = false;
        try
        {
            path = Path.GetFullPath(path);
            if (!string.Equals(Path.GetExtension(path), ".vrm", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("VRMファイルを指定してください。");
            if (!File.Exists(path)) throw new FileNotFoundException("設定されたVRMが見つかりません。ファイルを選び直してください。", path);
            if (new FileInfo(path).Length > 200 * 1024 * 1024) throw new InvalidDataException("VRMは200MB以下にしてください。");
            var bytes = await File.ReadAllBytesAsync(path);
            if (closing || requestId != modelRequestId) return;
            modelBytes = bytes; pendingModelPath = path;
            Send(new { type = "loadModel", requestId });
        }
        catch
        {
            if (requestId == modelRequestId) { pendingModelPath = null; ModelButton.IsEnabled = true; }
            throw;
        }
    }
    private void Demo_Click(object sender, RoutedEventArgs e)
    { modelRequestId++; pendingModelPath = null; ModelButton.IsEnabled = ready; ModelLabel.Text = "内蔵サンプル・ロボット"; Send(new { type = "demo" }); RestoreOutput(); }
    private void Track_Click(object sender, RoutedEventArgs e)
    {
        TrackButton.IsEnabled = false;
        Send(new { type = tracking ? "stopTracking" : "startTracking", deviceId = (Cameras.SelectedItem as CameraItem)?.Id ?? "" });
    }
    private void Calibrate_Click(object sender, RoutedEventArgs e) => Send(new { type = "calibrate" });
    private void Settings_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e) => SendSettings();
    private void SpringStrength_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (!ready || closing) return;
        SpringStrengthLabel.Text = $"揺れものの強さ：{SpringStrength.Value:0.0}倍";
        pendingSpringStrength = true; springTimer.Stop(); springTimer.Start(); SendSettings();
    }
    private void MouthStrength_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (!ready || closing) return;
        MouthStrengthLabel.Text = $"口の開き具合：{MouthStrength.Value:0.0}倍";
        MouthSensitivityLabel.Text = $"口の感度：{MouthSensitivity.Value:0.0}倍";
        pendingMouthSettings = true; mouthTimer.Stop(); mouthTimer.Start(); SendSettings();
    }
    private void Background_Changed(object sender, SelectionChangedEventArgs e) => SendSettings();
    private void SendSettings()
    {
        if (!ready) return;
        Send(new { type = "settings", smoothing = Smoothness.Value, sensitivity = Sensitivity.Value, mouthOpenStrength = MouthStrength.Value, mouthSensitivity = MouthSensitivity.Value, springStrength = SpringStrength.Value, background = (Background.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "#00ff00" });
    }
    private void Privacy_Toggled(object sender, RoutedEventArgs e) { if (!ready) return; output?.SetPrivacy(Privacy.IsOn); Send(new { type = "privacy", value = Privacy.IsOn }); }
    private void Register_Click(object sender, RoutedEventArgs e)
    {
        try { VirtualCamera.Register(Path.Combine(AppContext.BaseDirectory,"Assets","VirtualCamera","UnityCaptureFilter64.dll")); OutputStatus.Text = "登録完了。OBSのデバイス一覧を開き直してください。"; RegisterButton.Content = "仮想カメラ登録済み"; }
        catch (Exception ex) { Report(ex); }
    }
    private void Output_Click(object sender, RoutedEventArgs e)
    {
        if (!ready || closing) return;
        restoreOutputPending = false;
        SetOutput(output == null, true);
    }
    private void RestoreOutput()
    {
        if (!restoreOutputPending || closing || !ready) return;
        restoreOutputPending = false;
        SetOutput(true, false);
    }
    private void SetOutput(bool enabled, bool savePreference)
    {
        try
        {
            if (enabled && output == null)
            {
                if (!VirtualCamera.IsRegistered()) VirtualCamera.Register(Path.Combine(AppContext.BaseDirectory,"Assets","VirtualCamera","UnityCaptureFilter64.dll"));
                output = new VirtualCamera(); output.SetPrivacy(Privacy.IsOn); Send(new { type = "output", value = true }); OutputButton.Content = "仮想カメラ出力を停止";
            }
            else if (!enabled && output != null) { Send(new { type = "output", value = false }); output.Dispose(); output = null; OutputButton.Content = "仮想カメラ出力を開始"; OutputStatus.Text = "仮想カメラ：停止中"; }
            if (savePreference) AppSettings.SaveVirtualCameraEnabled(enabled);
            App.Log("Virtual-camera output: " + (enabled ? "enabled" : "disabled") + (savePreference ? " (saved)" : " (restored)"));
        }
        catch (Exception ex) { Report(ex); }
    }
    private void Report(Exception ex) { App.Log(ex.ToString()); TrackingStatus.Text = "エラー：" + ex.Message; }
}
