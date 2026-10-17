param(
    [string]$IdentityName = 'YuiTracking.Development',
    [string]$Publisher = 'CN=YuiTracking Development',
    [string]$PublisherDisplayName = 'YuiTracking',
    [string]$IdentityFile,
    [switch]$Store,
    [switch]$SkipAppBuild
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    if ($IdentityFile) {
        $identity = Get-Content -LiteralPath $IdentityFile -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($field in @('identityName', 'publisher', 'publisherDisplayName')) {
            if ([string]::IsNullOrWhiteSpace($identity.$field)) { throw "Identity file is missing $field." }
        }
        $IdentityName = $identity.identityName
        $Publisher = $identity.publisher
        $PublisherDisplayName = $identity.publisherDisplayName
    }
    if ($Store -and ($IdentityName -eq 'YuiTracking.Development' -or $Publisher -eq 'CN=YuiTracking Development')) {
        throw 'For Store builds, supply IdentityName and Publisher exactly as shown in Partner Center for an MSIX app.'
    }
    $sdkBin = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory |
        Where-Object { $_.Name -match '^10\.0\.\d+\.0$' -and (Test-Path (Join-Path $_.FullName 'x64\makeappx.exe')) } |
        Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
    if (-not $sdkBin) { throw 'Windows SDK with x64 MakeAppx is required.' }
    $makeAppx = Join-Path $sdkBin.FullName 'x64\makeappx.exe'
    if (-not $SkipAppBuild) { & "$PSScriptRoot\build.ps1" }
    $project = [xml](Get-Content -LiteralPath 'src/YuiTracking.App/YuiTracking.App.csproj' -Raw -Encoding UTF8)
    $appVersion = [string]$project.Project.PropertyGroup.Version
    if ($appVersion -notmatch '^\d+\.\d+\.\d+$') { throw 'App version must have three numeric components.' }
    foreach ($part in $appVersion.Split('.')) { if ([int]$part -gt 65535) { throw 'MSIX version components must be <= 65535.' } }
    $publishedVersion = (Get-Item -LiteralPath 'dist/YuiTracking/YuiTracking.exe').VersionInfo.FileVersion
    if ($publishedVersion -ne "$appVersion.0") { throw 'Published app version does not match the project. Publish first.' }
    # Unique staging avoids deleting or mixing a checkout, previous package or development registration.
    $staging = Join-Path $projectRoot ('dist\msix\staging\' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $staging | Out-Null
    Copy-Item -Path 'dist/YuiTracking/*' -Destination $staging -Recurse
    foreach ($notice in @('README.md', 'THIRD-PARTY-NOTICES.txt', 'LICENSE')) { Copy-Item -LiteralPath $notice -Destination $staging }
    # Packaged WinUI loads its primary XAML resource index as resources.pri.
    # Keep the original index too, since the EXE build uses YuiTracking.pri.
    Copy-Item -LiteralPath (Join-Path $staging 'YuiTracking.pri') -Destination (Join-Path $staging 'resources.pri')
    # Debug renderer maps and symbols are not part of the distributable package.
    foreach ($debugFile in (Get-ChildItem -LiteralPath $staging -Recurse -File | Where-Object { $_.Extension -in '.map', '.pdb' })) { Remove-Item -LiteralPath $debugFile.FullName }
    Add-Type -AssemblyName System.Drawing
    $image = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'src\YuiTracking.App\Assets\Branding\YuiTracking.png'))
    $logoDirectory = Join-Path $staging 'Assets\Msix'
    New-Item -ItemType Directory -Force $logoDirectory | Out-Null
    try {
        foreach ($logo in @(@('StoreLogo.png', 50), @('Square44x44Logo.png', 44), @('Square150x150Logo.png', 150))) {
            $bitmap = New-Object System.Drawing.Bitmap([int]$logo[1], [int]$logo[1])
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($image, 0, 0, [int]$logo[1], [int]$logo[1])
                $bitmap.Save((Join-Path $logoDirectory $logo[0]), [System.Drawing.Imaging.ImageFormat]::Png)
            } finally { $graphics.Dispose(); $bitmap.Dispose() }
        }
    } finally { $image.Dispose() }
    $manifest = [xml](Get-Content -LiteralPath 'packaging/msix/AppxManifest.xml' -Raw -Encoding UTF8)
    $manifest.Package.Identity.Name = $IdentityName
    $manifest.Package.Identity.Publisher = $Publisher
    $manifest.Package.Identity.Version = "$appVersion.0"
    $manifest.Package.Properties.PublisherDisplayName = $PublisherDisplayName
    $manifest.Save((Join-Path $staging 'AppxManifest.xml'))
    $variant = if ($Store) { 'store' } else { 'development' }
    $packagePath = Join-Path $projectRoot "dist\msix\YuiTracking-$appVersion-x64-$variant.msix"
    & $makeAppx pack /d $staging /p $packagePath /o
    if ($LASTEXITCODE) { throw 'MakeAppx validation/pack failed.' }
    Get-FileHash -LiteralPath $packagePath -Algorithm SHA256 |
        ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($packagePath))" } |
        Set-Content (Join-Path (Split-Path $packagePath) "SHA256SUMS-$variant.txt")
    Write-Host "Unsigned package: $packagePath"
    Write-Host "Development layout: $staging"
    @{ package = $packagePath; layout = $staging; version = "$appVersion.0"; variant = $variant } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path (Split-Path $packagePath) "build-$variant.json")
    if (-not $Store) { Write-Host 'Development identity only; do not submit this package to Store.' }
} finally { Pop-Location }
