# Builds the app for development and starts it. Tests and the installer are skipped.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $running = @(Get-Process YuiTracking -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        Write-Host "YuiTracking is running: $($running[0].Path)"
        if ((Read-Host 'Close it and continue? (y/N)') -notmatch '^[yY]') { Write-Host 'Canceled.'; exit 0 }
        foreach ($process in $running) {
            [void]$process.CloseMainWindow()
            if (-not $process.WaitForExit(15000)) { throw 'YuiTracking did not close. Close it and try again.' }
        }
    }

    $bundle = Join-Path $projectRoot 'src/YuiTracking.App/Assets/Renderer/main.js'
    $sources = @(Get-ChildItem renderer/src -Recurse -File) + @(Get-Item renderer/index.html, renderer/build.mjs, renderer/package-lock.json)
    $newest = ($sources | Measure-Object LastWriteTimeUtc -Maximum).Maximum
    if (-not (Test-Path $bundle) -or $newest -gt (Get-Item $bundle).LastWriteTimeUtc) {
        Write-Host 'Building the renderer...'
        Push-Location renderer
        try {
            if (-not (Test-Path node_modules)) {
                npm ci --no-fund --no-audit
                if ($LASTEXITCODE) { throw 'npm ci failed' }
            }
            npm run build
            if ($LASTEXITCODE) { throw 'Renderer build failed' }
        } finally { Pop-Location }
    }

    $dotnetPath = Join-Path $projectRoot '.tools\dotnet\dotnet.exe'
    if (-not (Test-Path $dotnetPath)) { $dotnetPath = (Get-Command dotnet -ErrorAction Stop).Source }
    Write-Host 'Building the app...'
    & $dotnetPath publish src/YuiTracking.App/YuiTracking.App.csproj -c Release -p:OutputPath=bin/Package/ -o dist/YuiTracking --nologo -v quiet
    if ($LASTEXITCODE) { throw 'App build failed' }

    $app = Join-Path $projectRoot 'dist\YuiTracking\YuiTracking.exe'
    Start-Process -FilePath $app -WorkingDirectory (Split-Path $app)
    Write-Host 'Started YuiTracking.'
} finally { Pop-Location }
