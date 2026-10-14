using System.Diagnostics;
namespace YuiTracking;
internal record MemoryUsage(long AppBytes, long WebViewBytes, int Unavailable)
{
    public double TotalMb => (AppBytes + WebViewBytes) / 1048576d;
    public static MemoryUsage Measure(IEnumerable<int> webViewIds)
    {
        long app = 0, webView = 0; int unavailable = 0;
        foreach (var id in webViewIds.Append(Environment.ProcessId).Distinct())
        {
            try
            {
                using var process = Process.GetProcessById(id);
                if (id == Environment.ProcessId) app += process.WorkingSet64;
                else webView += process.WorkingSet64;
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
            { unavailable++; }
        }
        return new(app, webView, unavailable);
    }
}
