using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using YuiTracking;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var assets = Path.GetFullPath(args[0]);
        var device = args.Length > 1 ? GpuCatalog.Enumerate().Single(d => d.Id == args[1]) : null;
        var profile = Path.Combine(Path.GetTempPath(), "yuitracking-webview-recognition-" + Guid.NewGuid());
        using var form = new Form { Width = 800, Height = 600, Opacity = 0, ShowInTaskbar = false };
        using var view = new WebView2 { Dock = DockStyle.Fill };
        form.Controls.Add(view);
        using var timeout = new System.Windows.Forms.Timer { Interval = 90000 };
        var code = 1; var backendReady = false; var stopped = false;
        void Fail(Exception error) { Console.Error.WriteLine(error); timeout.Stop(); form.Close(); }
        timeout.Tick += (_, _) => Fail(new TimeoutException("WebView2 recognition timed out"));
        form.Shown += async (_, _) =>
        {
            try
            {
                timeout.Start();
                var flags = "--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";
                if (device != null) flags += GpuCatalog.BrowserArguments(device);
                var env = await CoreWebView2Environment.CreateAsync(null, profile, new CoreWebView2EnvironmentOptions(flags));
                await view.EnsureCoreWebView2Async(env);
                var core = view.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping("yuitracking.local", assets, CoreWebView2HostResourceAccessKind.DenyCors);
                core.PermissionRequested += (_, e) => e.State = e.PermissionKind == CoreWebView2PermissionKind.Camera ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
                core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
                core.WebResourceRequested += (_, e) => { if (!e.Request.Uri.StartsWith("https://yuitracking.local/")) e.Response = env.CreateWebResourceResponse(new MemoryStream(), 403, "Blocked", ""); };
                void Send(object message) => core.PostWebMessageAsJson(JsonSerializer.Serialize(message));
                core.WebMessageReceived += (_, e) =>
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(e.WebMessageAsJson); var message = doc.RootElement;
                        switch (message.GetProperty("type").GetString())
                        {
                            case "ready":
                                Send(new { type = "recognitionConfig", @delegate = device == null ? "CPU" : "GPU", expectedRenderer = device?.Name ?? "" });
                                Send(new { type = "startTracking" }); break;
                            case "error": throw new Exception(message.GetProperty("text").GetString());
                            case "recognitionReady":
                                if (message.GetProperty("delegate").GetString() != (device == null ? "CPU" : "GPU")) throw new Exception("Wrong recognition delegate");
                                Console.WriteLine(message.GetRawText()); backendReady = true; break;
                            case "handDetection":
                                if (!backendReady) throw new Exception("Inference before backend initialized");
                                stopped = true; Send(new { type = "stopTracking" }); break;
                            case "tracking":
                                if (stopped && !message.GetProperty("active").GetBoolean())
                                { Console.WriteLine("PASS WebView2 initialization, face/hand/pose inference and stop: " + (device?.Name ?? "CPU")); code = 0; timeout.Stop(); form.Close(); }
                                break;
                        }
                    }
                    catch (Exception error) { Fail(error); }
                };
                core.Navigate("https://yuitracking.local/index.html");
            }
            catch (Exception error) { Fail(error); }
        };
        Application.Run(form);
        return code;
    }
}
