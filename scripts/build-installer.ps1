param([switch]$SkipAppBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if (-not $SkipAppBuild) { & "$PSScriptRoot\build.ps1" }
    $project = [xml](Get-Content -LiteralPath 'src/YuiTracking.App/YuiTracking.App.csproj' -Raw)
    $appVersion = [string]$project.Project.PropertyGroup.Version
    $publishedVersion = (Get-Item -LiteralPath 'dist/YuiTracking/YuiTracking.exe').VersionInfo.FileVersion
    if ($publishedVersion -ne "$appVersion.0") { throw "Published app version $publishedVersion does not match $appVersion. Build the app first." }
    $installerName = "YuiTracking-Setup-$appVersion-x64.exe"
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
    & $compiler "/DAppVersion=$appVersion" installer/YuiTracking.iss
    if ($LASTEXITCODE) { throw 'Installer build failed' }
    Get-FileHash -LiteralPath (Join-Path 'dist/installer' $installerName) -Algorithm SHA256 |
        ForEach-Object { "$($_.Hash)  $installerName" } |
        Set-Content dist/installer/SHA256SUMS.txt
} finally { Pop-Location }
