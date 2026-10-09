param([switch]$SkipAppBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not $SkipAppBuild) { & "$PSScriptRoot\build.ps1" }
    $compiler = Join-Path $projectRoot '.tools\InnoSetup\ISCC.exe'
    if (-not (Test-Path $compiler)) { $compiler = (Get-Command ISCC.exe -ErrorAction Stop).Source }
    $bootstrapper = Join-Path $projectRoot '.tools\MicrosoftEdgeWebview2Setup.exe'
    if (-not (Test-Path $bootstrapper)) {
        New-Item -ItemType Directory -Force .tools | Out-Null
        Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw 'Microsoft WebView2 bootstrapper signature verification failed.'
    }
    & $compiler installer/YuiTracking.iss
    if ($LASTEXITCODE) { throw 'Installer build failed' }
    Get-FileHash dist/installer/YuiTracking-Setup-0.1.3-x64.exe -Algorithm SHA256 |
        ForEach-Object { "$($_.Hash)  YuiTracking-Setup-0.1.3-x64.exe" } |
        Set-Content dist/installer/SHA256SUMS.txt
} finally { Pop-Location }
