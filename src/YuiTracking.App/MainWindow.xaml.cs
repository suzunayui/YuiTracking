using System.Text;
using CameraItem = YuiTracking.CameraChoices.Item;
using System.Text.Json;
using System.Reflection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Windows.Storage.Pickers;
using Windows.Devices.Enumeration;

namespace YuiTracking;
public sealed partial class MainWindow : Window
{
    private bool ready, tracking, closing;
    private string recognitionDelegate = "CPU";
    private GpuCatalog.Device? recognitionGpu;
    public record RecognitionDeviceItem(string Label, string Delegate, object? Device = null)
    { internal GpuCatalog.Device? Adapter => Device as GpuCatalog.Device; }
    private void InitializeRecognitionDevices()
    {
        var items = new List<RecognitionDeviceItem> { new("CPU", "CPU") };
        try
        {
            var devices = GpuCatalog.Enumerate();
            for (var i = 0; i < devices.Count; i++)
            {
                var device = devices[i];
                items.Add(new($"{device.Name} · {device.MemoryBytes / 1073741824.0:0.#} GB（候補{i + 1}）", "GPU", device));
            }
            var saved = AppSettings.RecognitionDevice;
            recognitionGpu = saved.Delegate == "GPU" ? devices.FirstOrDefault(d => d.Id == saved.AdapterId && d.Name == saved.AdapterName) : null;
            recognitionDelegate = recognitionGpu == null ? "CPU" : "GPU";
            RecognitionStatus.Text = saved.Delegate == "GPU" && recognitionGpu == null
                ? "保存したGPUが見つからないため、今回はCPUを使います。GPUを選び直して保存してください。"
                : "現在の認識設定：" + (recognitionGpu?.Name ?? "CPU");
        }
        catch (Exception ex) { recognitionDelegate = "CPU"; recognitionGpu = null; RecognitionStatus.Text = "GPU一覧を取得できないためCPUを使います。"; App.Log(ex.ToString()); }
        RecognitionDevice.ItemsSource = items;
        RecognitionDevice.SelectedItem = items.FirstOrDefault(i => i.Adapter == recognitionGpu) ?? items[0];
    }
    private void SaveRecognition_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            if (RecognitionDevice.SelectedItem is not RecognitionDeviceItem item) return;
            AppSettings.SaveRecognitionDevice(new(item.Delegate, item.Adapter?.Id, item.Adapter?.Name));
            RecognitionStatus.Text = "保存しました。アプリを再起動すると反映します。現在：" + (recognitionGpu?.Name ?? "CPU");
        }
        catch (Exception ex) { Report(ex); }
    }
    private CalibrationShortcut? calibrationShortcut;
    private bool restoreOutputPending;
    private VirtualCamera? output;
    private CoreWebView2SharedBuffer? frameBuffer;
    private Stream? frameStream;
    private readonly byte[] frameBytes = new byte[VirtualCamera.FrameBytes];
    private string performanceStatus = "";
    private string backgroundColor = "#00ff00";
    private string? backgroundImagePath, pendingBackgroundPath;
    private string pendingBackgroundColor = "#00ff00", backgroundMime = "image/png";
    private byte[]? backgroundBytes;
    private int backgroundRequestId;
    private bool backgroundSavePending;
    private string? powerPolicyStatus;
    private byte[]? modelBytes;
    private int modelRequestId;
    private string? pendingModelPath;
    private string? currentVrmPath;
    private string? pendingSample;
    private string? selectedSample;
    private int statusTicks;
    private string? temporaryStatus;
    private long temporaryStatusExpires;
    private bool measuringMemory;
    private void SelectSample(string? sample)
    {
        selectedSample = sample;
        SampleGirl.IsChecked = sample == "Y";
        SampleBoy.IsChecked = sample == "Z";
        SampleRobot.IsChecked = sample == "robot";
        ToolTipService.SetToolTip(SampleGirl, sample == "Y" ? "女の子のサンプル（Y）を表示中です。" : "女の子のサンプル（Y）に切り替えます。");
        ToolTipService.SetToolTip(SampleBoy, sample == "Z" ? "男の子のサンプル（Z）を表示中です。" : "男の子のサンプル（Z）に切り替えます。");
        ToolTipService.SetToolTip(SampleRobot, sample == "robot" ? "内蔵ロボットを表示中です。" : "内蔵ロボットに切り替えます。");
    }
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer statusTimer;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer framingTimer;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer mouthTimer;
    private readonly Microsoft.UI.Dispatching.DispatcherQueueTimer springTimer;
    private bool pendingSpringStrength;
    private void SaveSpringStrength()
    {
        springTimer.Stop();
        if (!pendingSpringStrength) return;
        try { AppSettings.SaveSpringStrength(SpringStrength.Value, ChestSpringStrength.Value); pendingSpringStrength = false; }
        catch (Exception ex) { App.Log(ex.Message); }
    }
    private bool pendingMouthSettings;
    private void SaveMouthStrength()
    {
        mouthTimer.Stop();
        if (!pendingMouthSettings) return;
        try { AppSettings.SaveMotionSettings(MouthStrength.Value, MouthSensitivity.Value, Sensitivity.Value, BodyStrength.Value, ForwardLeanStrength.Value, BackwardLeanStrength.Value, SelectedGazeMode, GazeStrength.Value, GazeRange.Value, NearZoomStrength.Value, FarZoomStrength.Value); pendingMouthSettings = false; }
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
    private readonly CameraChoices cameraChoices = new();
    private readonly CameraChoicePresenter cameraPresenter;
    private bool cameraStarting;
    private int cameraRefreshVersion;
    private DeviceWatcher? cameraWatcher;
    private void UpdateCameraChoices()
    {
        cameraPresenter.Refresh();
        Cameras.PlaceholderText = "カメラを選択";
        if (!cameraStarting) TrackButton.IsEnabled = ready && (tracking || Cameras.Items.Count > 0);
        RefreshCamerasButton.IsEnabled = ready && !tracking && !cameraStarting;
    }
    private async void RefreshCameras_Click(object sender, RoutedEventArgs e) => await RefreshNativeCameras();
    private async Task RefreshNativeCameras()
    {
        if (closing || tracking || cameraStarting) return;
        var version = ++cameraRefreshVersion;
        try
        {
            var devices = await NativeCameraCatalog.EnumerateAsync();
            if (closing || tracking || cameraStarting || version != cameraRefreshVersion) return;
            cameraChoices.UpdateNative(devices.Select(d => new CameraItem(d.Id, d.Label, true)));
            App.Log("Native cameras: " + string.Join(" / ", devices.Select(d => d.Label)));
            UpdateCameraChoices();
        }
        catch (Exception ex) { App.Log("Native camera enumeration failed: " + ex.Message); UpdateCameraChoices(); }
        if (!closing) Send(new { type = "refreshCameras" });
    }
    private void WatchNativeCameras()
    {
        cameraWatcher = DeviceInformation.CreateWatcher(DeviceClass.VideoCapture);
        void Changed() => DispatcherQueue.TryEnqueue(async () => await RefreshNativeCameras());
        cameraWatcher.Added += (_, _) => Changed();
        cameraWatcher.Removed += (_, _) => Changed();
        cameraWatcher.Updated += (_, _) => Changed();
        cameraWatcher.Start();
    }
    public MainWindow()
    {
        InitializeComponent();
        cameraPresenter = new CameraChoicePresenter(Cameras, cameraChoices);
        Cameras.DropDownOpened += (_, _) => App.Log("Camera dropdown opened: " + string.Join(" / ", Cameras.Items.OfType<CameraItem>().Select(c => c.Label)));
        Cameras.SelectionChanged += (_, _) => { if (Cameras.SelectedItem is CameraItem item) App.Log("Camera selected: " + item.Label); };
        InitializeRecognitionDevices();
        Root.AddHandler(UIElement.KeyDownEvent, new Microsoft.UI.Xaml.Input.KeyEventHandler((_, e) =>
        {
            if (e.Key == Windows.System.VirtualKey.Escape && previewMaximized)
            { TogglePreviewMaximized(); e.Handled = true; }
        }), true);
        UpdateMotionLabels();
        var version = typeof(App).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]
            ?? typeof(App).Assembly.GetName().Version?.ToString(3);
        Title = $"YuiTracking {version}";
        framingTimer = DispatcherQueue.CreateTimer(); framingTimer.Interval = TimeSpan.FromMilliseconds(250);
        framingTimer.Tick += (_, _) => SaveFraming();
        mouthTimer = DispatcherQueue.CreateTimer(); mouthTimer.Interval = TimeSpan.FromMilliseconds(250);
        mouthTimer.Tick += (_, _) => SaveMouthStrength();
        springTimer = DispatcherQueue.CreateTimer(); springTimer.Interval = TimeSpan.FromMilliseconds(250);
        springTimer.Tick += (_, _) => SaveSpringStrength();
        try { SpringStrength.Value = AppSettings.SpringStrength; ChestSpringStrength.Value = AppSettings.ChestSpringStrength; }
        catch (Exception ex) { App.Log(ex.Message); }
        SpringStrengthLabel.Text = $"揺れものの強さ：{SpringStrength.Value:0.0}倍";
        ChestSpringStrengthLabel.Text = $"胸の揺れやすさ：{ChestSpringStrength.Value:0.0}倍";
        try { MouthStrength.Value = AppSettings.MouthOpenStrength; MouthSensitivity.Value = AppSettings.MouthSensitivity; Sensitivity.Value = AppSettings.FaceSensitivity; BodyStrength.Value = AppSettings.BodyStrength; ForwardLeanStrength.Value = AppSettings.ForwardLeanStrength; BackwardLeanStrength.Value = AppSettings.BackwardLeanStrength; NearZoomStrength.Value = AppSettings.NearZoomStrength; FarZoomStrength.Value = AppSettings.FarZoomStrength; GazeStrength.Value = AppSettings.GazeStrength; GazeRange.Value = AppSettings.GazeRange; GazeMode.SelectedIndex = AppSettings.GazeMode switch { "camera" => 1, "fixed" => 2, _ => 0 }; UpdateMotionLabels(); }
        catch (Exception ex) { App.Log(ex.Message); }
        MouthStrengthLabel.Text = $"口の開き具合：{MouthStrength.Value:0.0}倍";
        MouthSensitivityLabel.Text = $"口の感度：{MouthSensitivity.Value:0.0}倍";
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "Branding", "YuiTracking.ico"));
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1320, 900));
        if (VirtualCamera.IsRegistered()) RegisterButton.Visibility = Visibility.Collapsed;
        statusTimer = DispatcherQueue.CreateTimer(); statusTimer.Interval = TimeSpan.FromSeconds(1);
        statusTimer.Tick += (_, _) =>
        {
            if (tracking) UpdateTrackingPowerPolicy();
            if (output != null) OutputStatus.Text = "仮想カメラ：" + output.Status + performanceStatus;
            if (statusTicks++ % 5 == 0) _ = UpdateMemoryUsageAsync();
            if (temporaryStatus != null && Environment.TickCount64 >= temporaryStatusExpires)
            {
                // A later error or other status must never be overwritten by expiry.
                if (TrackingStatus.Text == temporaryStatus) TrackingStatus.Text = tracking ? "トラッキング中" : "VRMを表示中";
                temporaryStatus = null;
            }
        };
        statusTimer.Start();
        try
        {
            calibrationShortcut = new CalibrationShortcut(() => DispatcherQueue.TryEnqueue(() =>
            {
                if (ready && tracking && !closing) { App.Log("Global calibration shortcut triggered"); Send(new { type = "calibrate" }); }
            }));
        }
        catch (Exception ex) { App.Log("Calibration shortcuts unavailable: " + ex.Message); }
        Root.Loaded += async (_, _) => await InitializeRenderer();
        Root.Loaded += async (_, _) =>
        {
            await RefreshNativeCameras();
            try { if (!closing) WatchNativeCameras(); }
            catch (Exception ex) { App.Log("Camera watcher unavailable: " + ex.Message); }
        };
        Closed += (_, _) =>
        {
            cameraRefreshVersion++;
            if (cameraWatcher?.Status is DeviceWatcherStatus.Started or DeviceWatcherStatus.EnumerationCompleted)
                cameraWatcher.Stop();
        };
        Closed += (_, _) => { closing = true; calibrationShortcut?.Dispose(); SaveFraming(); SaveMouthStrength(); SaveSpringStrength(); output?.Dispose(); statusTimer.Stop(); Viewport.Close(); frameStream?.Dispose(); frameBuffer?.Dispose(); };
    }
    private async Task InitializeRenderer()
    {
        try
        {
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YuiTracking", "WebView");
            var options = new CoreWebView2EnvironmentOptions { AdditionalBrowserArguments = "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion" };
            if (recognitionGpu != null) options.AdditionalBrowserArguments += GpuCatalog.BrowserArguments(recognitionGpu);
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
                e.State = e.Uri.StartsWith("https://yuitracking.local/", StringComparison.Ordinal) && e.PermissionKind == CoreWebView2PermissionKind.Camera
                    ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
                e.SavesInProfile = false;
            };
            core.NavigationStarting += (_, e) => { if (e.Uri != "https://yuitracking.local/index.html") e.Cancel = true; };
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.WebMessageReceived += MessageReceived;
            core.ProcessFailed += (_, e) =>
            {
                App.Log($"WebView2 process failed: kind={e.ProcessFailedKind}, reason={e.Reason}, exitCode=0x{e.ExitCode:X8}, description={e.ProcessDescription}");
                if (e.ProcessFailedKind is CoreWebView2ProcessFailedKind.BrowserProcessExited
                    or CoreWebView2ProcessFailedKind.RenderProcessExited
                    or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
                    ShowRendererFailure();
            };
            core.Navigate("https://yuitracking.local/index.html");
        }
        catch (Exception ex) { App.Log(ex.ToString()); ShowRendererFailure(); }
    }
    private void ShowRendererFailure()
    {
        if (closing) return;
        ready = false;
        tracking = false;
        performanceStatus = "";
        output?.SetPrivacy(true);
        ModelButton.IsEnabled = TrackButton.IsEnabled = OutputButton.IsEnabled = false;
        TrackingStatus.Text = "描画が停止しました。再起動できます。";
        Viewport.Visibility = Visibility.Collapsed;
        RendererFailurePanel.Visibility = Visibility.Visible;
    }
    private void Restart_Click(object sender, RoutedEventArgs e)
    {
        if (closing || !RestartButton.IsEnabled) return;
        RestartButton.IsEnabled = false;
        try
        {
            // Restart terminates this process without raising Window.Closed.
            SaveFraming(); SaveMouthStrength(); SaveSpringStrength();
            output?.SetPrivacy(true);
            App.Log("User requested restart after renderer failure");
            var failure = Microsoft.Windows.AppLifecycle.AppInstance.Restart("");
            App.Log($"App restart failed: {failure}");
        }
        catch (Exception ex) { App.Log($"App restart failed: {ex}"); }
        RendererFailureMessage.Text = "再起動できませんでした。もう一度ボタンを押すか、アプリを閉じて開き直してください。保存したVRMと設定は引き継がれます。";
        RestartButton.IsEnabled = true;
    }
    private async void ResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var uri = new Uri(e.Request.Uri);
        if (uri.Scheme == "blob" || uri.Scheme == "data") return;
        if (uri.Host != "yuitracking.local") { e.Response = sender.Environment.CreateWebResourceResponse(null,403,"Forbidden",""); return; }
        if (uri.AbsolutePath == "/background-image")
        {
            e.Response = sender.Environment.CreateWebResourceResponse(backgroundBytes == null ? null : new MemoryStream(backgroundBytes).AsRandomAccessStream(), backgroundBytes == null ? 404 : 200, "OK", $"Content-Type: {backgroundMime}\r\nCache-Control: no-store"); return;
        }
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
    private bool previewMaximized;
    private void MaximizePreview_Click(object sender, RoutedEventArgs e)
    {
        if (!previewMaximized) TogglePreviewMaximized();
        Viewport.Focus(FocusState.Programmatic);
    }
    private void TogglePreviewMaximized()
    {
        previewMaximized = !previewMaximized;
        var visibility = previewMaximized ? Visibility.Collapsed : Visibility.Visible;
        PreviewStatus.Visibility = SettingsPanel.Visibility = visibility;
        Root.Padding = new Thickness(previewMaximized ? 0 : 16);
        MainContent.ColumnSpacing = previewMaximized ? 0 : 16;
        SettingsColumn.Width = new GridLength(previewMaximized ? 0 : 300);
        PreviewPanel.RowSpacing = previewMaximized ? 0 : 8;
        PreviewBorder.CornerRadius = new CornerRadius(previewMaximized ? 0 : 10);
        PreviewBorder.BorderThickness = new Thickness(previewMaximized ? 0 : 1);
    }
    private async Task UpdateMemoryUsageAsync()
    {
        if (closing || measuringMemory) return;
        measuringMemory = true;
        try
        {
            var ids = Viewport.CoreWebView2?.Environment.GetProcessInfos().Select(p => checked((int)p.ProcessId)).ToArray() ?? Array.Empty<int>();
            var memory = await Task.Run(() => MemoryUsage.Measure(ids));
            if (closing) return;
            MemoryStatus.Text = $"メモリ：{memory.TotalMb:N0}MB";
            ToolTipService.SetToolTip(MemoryStatus, $"本体：{memory.AppBytes / 1048576d:N0}MB\nWebView2：{memory.WebViewBytes / 1048576d:N0}MB\n約5秒ごとに更新します。共有領域を含むため、\nタスクマネージャーの表示と一致しない場合があります。\nGPU専用メモリは含みません。" + (memory.Unavailable > 0 ? "\n終了・取得不可のプロセスを除いた概算です。" : ""));
        }
        catch (Exception ex) { if (!closing) { MemoryStatus.Text = "メモリ：取得できません"; ToolTipService.SetToolTip(MemoryStatus, ex.Message); } }
        finally { measuringMemory = false; }
    }
    private void UpdateTrackingPowerPolicy()
    {
        if (closing || Viewport.CoreWebView2 == null) return;
        try
        {
            var results = new List<string>();
            foreach (var process in Viewport.CoreWebView2.Environment.GetProcessInfos())
            {
                if (process.Kind != CoreWebView2ProcessKind.Renderer) continue;
                var error = TrackingPowerPolicy.Apply(checked((uint)process.ProcessId), tracking);
                results.Add($"{process.ProcessId}:{error}");
            }
            var state = $"Tracking power policy active={tracking}: {string.Join(",", results)}";
            if (state != powerPolicyStatus) { powerPolicyStatus = state; App.Log(state); }
        }
        catch (Exception ex)
        {
            if (powerPolicyStatus != ex.Message) { powerPolicyStatus = ex.Message; App.Log("Tracking power policy: " + ex.Message); }
        }
    }
    private async void MessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith("https://yuitracking.local/", StringComparison.Ordinal)) return;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson); var root = doc.RootElement;
            switch (root.GetProperty("type").GetString())
            {
                case "ready":
                    ready = true; ModelButton.IsEnabled = TrackButton.IsEnabled = OutputButton.IsEnabled = true;
                    UpdateCameraChoices();
                    try
                    {
                        frameStream?.Dispose(); frameBuffer?.Dispose();
                        frameBuffer = sender.Environment.CreateSharedBuffer((ulong)VirtualCamera.FrameBytes);
                        frameStream = frameBuffer.OpenStream().AsStream();
                        sender.PostSharedBufferToScript(frameBuffer, CoreWebView2SharedBufferAccess.ReadWrite, "{\"type\":\"avatarFrame\"}");
                        App.Log("Shared-memory frame transport ready");
                    }
                    catch (Exception ex) { frameStream = null; App.Log("Frame transport fallback: " + ex.Message); }
                    TrackingStatus.Text = "準備完了";
                    Send(new { type = "recognitionConfig", @delegate = recognitionDelegate, expectedRenderer = recognitionGpu?.Name ?? "" });
                    SendSettings(); App.Log("Renderer ready");
                    try
                    {
                        var savedColor = AppSettings.BackgroundColor;
                        if (savedColor is "#ff0000" or "#00ff00" or "#0000ff" or "#000000" or "transparent") backgroundColor = savedColor;
                        SetBackground(backgroundColor, null, false);
                        if (AppSettings.BackgroundImagePath is string savedImage) await LoadBackgroundImageAsync(savedImage, false);
                    }
                    catch (Exception ex) { Report(ex); }
                    restoreOutputPending = AppSettings.VirtualCameraEnabled;
                    var framing = AppSettings.SavedFraming;
                    if (framing != null) Send(new { type = "restoreFraming", zoom = framing.Zoom, x = framing.X, y = framing.Y, z = framing.Z, targetX = framing.TargetX, targetY = framing.TargetY, targetZ = framing.TargetZ });
                    var defaultModel = AppSettings.DefaultVrmPath;
                    var defaultSample = AppSettings.DefaultSample;
                    if (defaultSample is "Y" or "Z") await LoadSampleAsync(defaultSample);
                    else if (defaultSample == "robot") { ModelLabel.Text = "内蔵ロボット"; SelectSample("robot"); RestoreOutput(); }
                    else if (!string.IsNullOrWhiteSpace(defaultModel)) await LoadModelAsync(defaultModel);
                    else await LoadSampleAsync("Y");
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
                    performanceStatus = $" · 描画 {root.GetProperty("renderFps").GetDouble():F0} / 出力 {root.GetProperty("frameFps").GetDouble():F0}fps";
                    App.Log("Frame performance: " + root.GetRawText());
                    break;
                case "recognitionReady":
                    RecognitionStatus.Text = "認識中：" + root.GetProperty("delegate").GetString();
                    if (root.TryGetProperty("renderer", out var rendererName)) RecognitionStatus.Text += " / " + rendererName.GetString();
                    App.Log("Recognition backend: " + root.GetRawText());
                    break;
                case "springCapabilities":
                    ChestSpringStrength.IsEnabled = root.GetProperty("chestJoints").GetInt32() > 0;
                    ChestSpringAvailability.Text = ChestSpringStrength.IsEnabled ? "胸の揺れ設定を検出しました。" : "このモデルには対応する胸の揺れ設定がありません。";
                    break;
                case "framingChanged":
                    var zoom = root.GetProperty("zoom").GetDouble();
                    var x = root.GetProperty("x").GetDouble(); var y = root.GetProperty("y").GetDouble(); var z = root.GetProperty("z").GetDouble();
                    if (!double.IsFinite(zoom) || zoom < .5 || zoom > 20 || !double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(z)) break;
                    double? Coordinate(string name) => root.TryGetProperty(name, out var item) && item.TryGetDouble(out var value) && double.IsFinite(value) ? value : null;
                    pendingFraming = new(zoom, x, y, z, Coordinate("targetX"), Coordinate("targetY"), Coordinate("targetZ"));
                    framingTimer.Stop(); framingTimer.Start();
                    break;
                case "modelLoaded":
                    if (root.GetProperty("requestId").GetInt32() != modelRequestId || pendingModelPath == null) break;
                    ModelLabel.Text = pendingSample == "Y" ? "女の子（Y）" : pendingSample == "Z" ? "男の子（Z）" : Path.GetFileName(pendingModelPath);
                    App.Log("VRM loaded: " + pendingModelPath);
                    ModelButton.IsEnabled = true;
                    SelectSample(pendingSample);
                    currentVrmPath = pendingSample == null ? pendingModelPath : null;
                    if (pendingSample != null) AppSettings.SaveDefaultSample(pendingSample);
                    else AppSettings.SaveDefaultVrm(pendingModelPath);
                    pendingModelPath = null;
                    pendingSample = null;
                    RestoreOutput();
                    break;
                case "modelFailed":
                    if (root.GetProperty("requestId").GetInt32() == modelRequestId)
                    { pendingModelPath = pendingSample = null; ModelButton.IsEnabled = true; RestoreOutput(); }
                    break;
                case "togglePreviewMaximized": TogglePreviewMaximized(); break;
                case "restorePreview": if (previewMaximized) TogglePreviewMaximized(); break;
                case "backgroundLoaded":
                    if (root.GetProperty("requestId").GetInt32() != backgroundRequestId) break;
                    backgroundColor = pendingBackgroundColor; backgroundImagePath = pendingBackgroundPath;
                    UpdateBackgroundSelection();
                    if (backgroundSavePending) AppSettings.SaveBackground(backgroundColor, backgroundImagePath);
                    backgroundSavePending = false;
                    break;
                case "backgroundFailed":
                    if (root.GetProperty("requestId").GetInt32() != backgroundRequestId) break;
                    UpdateBackgroundSelection(); TrackingStatus.Text = root.GetProperty("text").GetString(); break;
                case "status":
                    TrackingStatus.Text = root.GetProperty("text").GetString();
                    temporaryStatus = root.TryGetProperty("temporary", out var temporary) && temporary.ValueKind == JsonValueKind.True ? TrackingStatus.Text : null;
                    temporaryStatusExpires = Environment.TickCount64 + 3000;
                    break;
                case "error": TrackingStatus.Text = root.GetProperty("text").GetString(); App.Log(TrackingStatus.Text ?? "Renderer error"); break;
                case "tracking":
                    cameraStarting = false; tracking = root.GetProperty("active").GetBoolean(); UpdateTrackingPowerPolicy();
                    HandDetectionStatus.Text = tracking ? "手：認識を準備中…" : "手：カメラ停止中";
                    TrackButton.Content = tracking ? "カメラを停止" : "カメラを開始";
                    ToolTipService.SetToolTip(TrackButton, tracking
                        ? "カメラでの顔・手・体の認識を停止します。\nアバターの動きへの反映も止まります。"
                        : "選択したカメラで顔・手・体の認識を開始します。\n認識した動きをアバターに反映します。");
                    TrackButton.IsEnabled = ready && (tracking || Cameras.Items.Count > 0);
                    RefreshCamerasButton.IsEnabled = ready && !tracking && !cameraStarting;
                    if (!tracking) await RefreshNativeCameras();
                    break;
                case "cameraInput":
                    if (root.TryGetProperty("deviceId", out var activeDevice))
                        Cameras.SelectedItem = Cameras.Items.OfType<CameraItem>().FirstOrDefault(c => c.Id == activeDevice.GetString()) ?? Cameras.SelectedItem;
                    CameraInputStatus.Text = $"カメラ入力：{root.GetProperty("width").GetInt32()} × {root.GetProperty("height").GetInt32()} / {root.GetProperty("fps").GetDouble():0.#}fps";
                    App.Log("Camera input: " + root.GetRawText());
                    break;
                case "handDetection":
                    if (root.TryGetProperty("count", out var count) && count.TryGetInt32(out var handCount) && handCount >= 0 && handCount <= 2)
                        HandDetectionStatus.Text = handCount == 0 ? "手：未検出" : $"手：{handCount}つ検出";
                    break;
                case "cameraListWarning":
                    App.Log(root.GetProperty("text").GetString() ?? "Camera list warning");
                    break;
                case "cameras":
                    var list = root.GetProperty("items").EnumerateArray().Select(c => new CameraItem(c.GetProperty("deviceId").GetString()!, c.GetProperty("label").GetString()!)).ToList();
                    cameraChoices.UpdateBrowser(list);
                    App.Log("Browser cameras: " + string.Join(" / ", list.Select(c => c.Label)));
                    UpdateCameraChoices();
                    break;
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
            string? lastVrm = null;
            try { lastVrm = AppSettings.DefaultVrmPath; } catch (Exception ex) { App.Log(ex.Message); }
            using var picker = new VrmFilePicker(VrmFilePicker.InitialFolder(currentVrmPath, lastVrm));
            var file = picker.Show(WinRT.Interop.WindowNative.GetWindowHandle(this)); if (file == null) return;
            await LoadModelAsync(file);
        }
        catch (Exception ex) { Report(ex); }
    }
    private async Task LoadModelAsync(string path, string? sample = null)
    {
        var requestId = ++modelRequestId;
        pendingSample = sample;
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
            if (requestId == modelRequestId) { pendingModelPath = pendingSample = null; ModelButton.IsEnabled = true; }
            throw;
        }
    }
    private void Demo_Click(object sender, RoutedEventArgs e)
    {
        SelectSample(selectedSample);
        if (!ready || closing) return;
        modelRequestId++; pendingModelPath = pendingSample = null; ModelButton.IsEnabled = true;
        currentVrmPath = null; ModelLabel.Text = "内蔵ロボット"; Send(new { type = "demo" }); SelectSample("robot"); RestoreOutput();
        try { AppSettings.SaveDefaultSample("robot"); } catch (Exception ex) { Report(ex); }
    }
    private Task LoadSampleAsync(string sample) => LoadModelAsync(
        Path.Combine(AppContext.BaseDirectory, "Assets", "Samples", $"AvatarSample_{sample}.vrm"), sample);
    private async void Sample_Click(object sender, RoutedEventArgs e)
    {
        SelectSample(selectedSample);
        if (!ready || closing || sender is not Microsoft.UI.Xaml.Controls.Primitives.ToggleButton item || item.Tag is not string sample || sample is not ("Y" or "Z")) return;
        try { await LoadSampleAsync(sample); } catch (Exception ex) { Report(ex); }
    }
    private void Track_Click(object sender, RoutedEventArgs e)
    {
        if (!ready || closing) return;
        var camera = Cameras.SelectedItem as CameraItem;
        if (!tracking && camera == null) { TrackingStatus.Text = "接続済みのカメラを選択してください。"; return; }
        TrackButton.IsEnabled = false;
        cameraStarting = !tracking;
        RefreshCamerasButton.IsEnabled = false;
        if (tracking) Send(new { type = "stopTracking" });
        else Send(cameraChoices.StartCommand(camera!));
    }
    private void Calibrate_Click(object sender, RoutedEventArgs e) => Send(new { type = "calibrate" });
    private void ResetFraming_Click(object sender, RoutedEventArgs e) => Send(new { type = "resetFraming" });
    private string SelectedGazeMode => (GazeMode?.SelectedItem as ComboBoxItem)?.Tag as string ?? "tracking";
    private void GazeMode_Changed(object sender, SelectionChangedEventArgs e)
    {
        UpdateMotionLabels();
        if (!ready || closing) return;
        pendingMouthSettings = true; mouthTimer.Stop(); mouthTimer.Start(); SendSettings();
    }
    private void UpdateMotionLabels()
    {
        if (FarZoomStrengthLabel != null && FarZoomStrength != null) FarZoomStrengthLabel.Text = FarZoomStrength.Value == 0 ? "遠距離による縮小：オフ" : $"遠距離による縮小：{FarZoomStrength.Value:0.0}倍";
        if (NearZoomStrengthLabel != null && NearZoomStrength != null) NearZoomStrengthLabel.Text = NearZoomStrength.Value == 0 ? "近距離による拡大：オフ" : $"近距離による拡大：{NearZoomStrength.Value:0.0}倍";
        if (GazeRange != null) GazeRange.IsEnabled = SelectedGazeMode != "fixed";
        if (GazeRangeLabel != null && GazeRange != null) GazeRangeLabel.Text = $"目の可動範囲：{GazeRange.Value:0.0}倍";
        if (GazeStrength != null) GazeStrength.IsEnabled = SelectedGazeMode == "tracking";
        if (GazeStrengthLabel != null && GazeStrength != null) GazeStrengthLabel.Text = $"目線の追従感度：{GazeStrength.Value:0.0}倍";
        // XAML ValueChanged can fire before all named controls are created.
        if (SmoothnessLabel != null && Smoothness != null) SmoothnessLabel.Text = $"滑らかさ：{Smoothness.Value * 100:0}%";
        if (ForwardLeanStrengthLabel != null && ForwardLeanStrength != null) ForwardLeanStrengthLabel.Text = $"前傾の強さ：{ForwardLeanStrength.Value:0.0}倍";
        if (BackwardLeanStrengthLabel != null && BackwardLeanStrength != null) BackwardLeanStrengthLabel.Text = $"反りの強さ：{BackwardLeanStrength.Value:0.0}倍";
        if (BodyStrengthLabel != null && BodyStrength != null) BodyStrengthLabel.Text = $"体の動きの強さ：{BodyStrength.Value:0.0}倍";
        if (SensitivityLabel != null && Sensitivity != null) SensitivityLabel.Text = $"顔の動きの強さ：{Sensitivity.Value:0.0}倍";
    }
    private void SettingsTab_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Microsoft.UI.Xaml.Controls.Primitives.ToggleButton button || button.Tag is not string tab) return;
        AvatarTab.IsChecked = tab == "avatar"; MotionTab.IsChecked = tab == "motion";
        AvatarSettings.Visibility = tab == "avatar" ? Visibility.Visible : Visibility.Collapsed;
        MotionSettings.Visibility = tab == "motion" ? Visibility.Visible : Visibility.Collapsed;
    }
    private void Settings_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    { UpdateMotionLabels(); SendSettings(); }
    private void FaceSensitivity_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        UpdateMotionLabels();
        if (!ready || closing) return;
        pendingMouthSettings = true; mouthTimer.Stop(); mouthTimer.Start(); SendSettings();
    }
    private void SpringStrength_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (!ready || closing) return;
        SpringStrengthLabel.Text = $"揺れものの強さ：{SpringStrength.Value:0.0}倍";
        ChestSpringStrengthLabel.Text = $"胸の揺れやすさ：{ChestSpringStrength.Value:0.0}倍";
        pendingSpringStrength = true; springTimer.Stop(); springTimer.Start(); SendSettings();
    }
    private void MouthStrength_Changed(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (!ready || closing) return;
        MouthStrengthLabel.Text = $"口の開き具合：{MouthStrength.Value:0.0}倍";
        MouthSensitivityLabel.Text = $"口の感度：{MouthSensitivity.Value:0.0}倍";
        pendingMouthSettings = true; mouthTimer.Stop(); mouthTimer.Start(); SendSettings();
    }
    private void Background_Click(object sender, RoutedEventArgs e)
    {
        UpdateBackgroundSelection();
        if (!ready || closing) return;
        if (sender is not Microsoft.UI.Xaml.Controls.Primitives.ToggleButton button || button.Tag is not string color) return;
        SetBackground(color, null, true);
    }
    private void UpdateBackgroundSelection()
    {
        var image = backgroundImagePath != null;
        BackgroundRed.IsChecked = !image && backgroundColor == "#ff0000";
        BackgroundGreen.IsChecked = !image && backgroundColor == "#00ff00";
        BackgroundBlue.IsChecked = !image && backgroundColor == "#0000ff";
        BackgroundBlack.IsChecked = !image && backgroundColor == "#000000";
        BackgroundTransparent.IsChecked = !image && backgroundColor == "transparent";
        BackgroundImage.IsChecked = image;
        ToolTipService.SetToolTip(BackgroundImage, image
            ? $"背景画像：{Path.GetFileName(backgroundImagePath)}\n押すと別の画像を選べます。"
            : "画像ファイルを選んで背景にします。\nPNG・JPEG・BMPに対応します。\n画像は比率を保って画面全体に配置します。");
    }
    private void SetBackground(string color, string? imagePath, bool save)
    {
        pendingBackgroundColor = color; pendingBackgroundPath = imagePath; backgroundSavePending = save;
        var requestId = ++backgroundRequestId;
        Send(new { type = "background", requestId, color, imageUrl = imagePath == null ? null : $"https://yuitracking.local/background-image?v={requestId}" });
    }
    private async Task LoadBackgroundImageAsync(string path, bool save)
    {
        path = Path.GetFullPath(path);
        var mime = Path.GetExtension(path).ToLowerInvariant() switch
        { ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", ".bmp" => "image/bmp", _ => throw new InvalidDataException("PNG・JPEG・BMPを選択してください。") };
        if (new FileInfo(path).Length > 20 * 1024 * 1024) throw new InvalidDataException("背景画像は20MB以下にしてください。");
        var version = backgroundRequestId;
        var bytes = await File.ReadAllBytesAsync(path);
        using (var stream = new MemoryStream(bytes).AsRandomAccessStream())
        {
            var decoder = await Windows.Graphics.Imaging.BitmapDecoder.CreateAsync(stream);
            if ((ulong)decoder.PixelWidth * decoder.PixelHeight > 32_000_000) throw new InvalidDataException("背景画像は3200万画素以下にしてください。");
        }
        if (closing || version != backgroundRequestId) return;
        backgroundBytes = bytes; backgroundMime = mime;
        SetBackground(backgroundColor, path, save);
    }
    private async void BackgroundImage_Click(object sender, RoutedEventArgs e)
    {
        UpdateBackgroundSelection();
        if (!ready || closing) return;
        try
        {
            var picker = new FileOpenPicker(); WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
            foreach (var extension in new[] { ".png", ".jpg", ".jpeg", ".bmp" }) picker.FileTypeFilter.Add(extension);
            var file = await picker.PickSingleFileAsync();
            if (file != null) await LoadBackgroundImageAsync(file.Path, true);
        }
        catch (Exception ex) { Report(ex); }
    }
    private void SendSettings()
    {
        if (!ready) return;
        Send(new { type = "settings", farZoomStrength = FarZoomStrength.Value, nearZoomStrength = NearZoomStrength.Value, gazeMode = SelectedGazeMode, gazeStrength = GazeStrength.Value, gazeRange = GazeRange.Value, smoothing = Smoothness.Value, sensitivity = Sensitivity.Value, bodyStrength = BodyStrength.Value, forwardLeanStrength = ForwardLeanStrength.Value, backwardLeanStrength = BackwardLeanStrength.Value, mouthOpenStrength = MouthStrength.Value, mouthSensitivity = MouthSensitivity.Value, springStrength = SpringStrength.Value, chestSpringStrength = ChestSpringStrength.Value, background = backgroundColor });
    }
    private void Privacy_Click(object sender, RoutedEventArgs e)
    {
        if (!ready) { Privacy.IsChecked = false; return; }
        var standby = Privacy.IsChecked == true;
        output?.SetPrivacy(standby);
        Send(new { type = "privacy", value = standby });
        ToolTipService.SetToolTip(Privacy, standby
            ? "待機画面を表示中です。\nもう一度押すとアバターの表示・出力に戻ります。"
            : "待機画面に切り替えます。\nオンの間はアバターの代わりに待機画面を出力します。");
    }
    private void Register_Click(object sender, RoutedEventArgs e)
    {
        try { VirtualCamera.Register(Path.Combine(AppContext.BaseDirectory,"Assets","VirtualCamera","UnityCaptureFilter64.dll")); OutputStatus.Text = "登録完了。OBSのデバイス一覧を開き直してください。"; RegisterButton.Visibility = Visibility.Collapsed; }
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
                output = new VirtualCamera(); output.SetPrivacy(Privacy.IsChecked == true); Send(new { type = "output", value = true }); OutputButton.Content = "仮想カメラ出力を停止";
            }
            else if (!enabled && output != null) { Send(new { type = "output", value = false }); output.Dispose(); output = null; OutputButton.Content = "仮想カメラ出力を開始"; OutputStatus.Text = "仮想カメラ：停止中"; }
            ToolTipService.SetToolTip(OutputButton, output != null
                ? "仮想カメラへの映像出力を停止します。\nプレビューとカメラのトラッキングは続きます。"
                : "アバター映像を仮想カメラへ出力します。\nOBSで「映像キャプチャデバイス」を追加し、\n「YuiTracking Camera」を選択してください。");
            if (savePreference) AppSettings.SaveVirtualCameraEnabled(enabled);
            App.Log("Virtual-camera output: " + (enabled ? "enabled" : "disabled") + (savePreference ? " (saved)" : " (restored)"));
        }
        catch (Exception ex) { Report(ex); }
    }
    private void Report(Exception ex) { App.Log(ex.ToString()); TrackingStatus.Text = "エラー：" + ex.Message; }
}
