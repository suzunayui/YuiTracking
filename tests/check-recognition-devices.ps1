param([string]$RendererPath = 'dist/YuiTracking/Assets/Renderer')
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $resolvedRenderer = (Resolve-Path -LiteralPath $RendererPath).Path
    dotnet build tests/GpuSmoke/GpuSmoke.csproj --verbosity quiet
    if ($LASTEXITCODE) { throw 'GPU catalog test build failed' }
    $catalogJson = dotnet run --no-build --project tests/GpuSmoke/GpuSmoke.csproj
    if ($LASTEXITCODE) { throw 'GPU catalog validation failed' }
    $devices = $catalogJson | ConvertFrom-Json
    dotnet build tests/WebViewRecognitionSmoke/WebViewRecognitionSmoke.csproj --verbosity quiet
    if ($LASTEXITCODE) { throw 'WebView2 recognition test build failed' }
    dotnet run --no-build --project tests/WebViewRecognitionSmoke/WebViewRecognitionSmoke.csproj -- $resolvedRenderer
    if ($LASTEXITCODE) { throw 'CPU recognition failed' }
    foreach ($device in $devices) {
        dotnet run --no-build --project tests/WebViewRecognitionSmoke/WebViewRecognitionSmoke.csproj -- $resolvedRenderer $device.Id
        if ($LASTEXITCODE) { throw "GPU recognition failed: $($device.Name)" }
    }
} finally { Pop-Location }
