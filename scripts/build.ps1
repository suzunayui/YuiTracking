$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $dotnetPath = Join-Path $projectRoot '.tools\dotnet\dotnet.exe'
    if (-not (Test-Path $dotnetPath)) { $dotnetPath = (Get-Command dotnet -ErrorAction Stop).Source }
    Push-Location renderer
    try {
        npm ci --no-fund --no-audit
        if ($LASTEXITCODE) { throw 'npm ci failed' }
        npm run build
        if ($LASTEXITCODE) { throw 'Renderer build failed' }
        npm test
        if ($LASTEXITCODE) { throw 'Renderer tests failed' }
    } finally { Pop-Location }
    & $dotnetPath run --project tests/CameraSmoke/CameraSmoke.csproj
    if ($LASTEXITCODE) { throw 'Virtual-camera tests failed' }
    & $dotnetPath publish src/HoloTrack.App/HoloTrack.App.csproj -c Release -p:OutputPath=bin/Package/ -o dist/YuiTracking
    if ($LASTEXITCODE) { throw 'App publish failed' }
    Copy-Item README.md dist/YuiTracking/README.md
    Copy-Item THIRD-PARTY-NOTICES.txt dist/YuiTracking/THIRD-PARTY-NOTICES.txt
    Write-Host "Ready: $projectRoot\dist\YuiTracking\YuiTracking.exe"
} finally { Pop-Location }
