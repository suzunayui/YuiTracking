$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$installer = Join-Path $projectRoot 'dist\installer\YuiTracking-Setup-0.1.3-x64.exe'
$testDir = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools\installer-smoke'))
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
if (-not $testDir.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid test target' }
if (Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{A4A68FE9-BAEA-4CBB-A7DD-877B688187BD}_is1') {
    throw 'An installed copy exists. Do not replace a user installation for this test.'
}
if (Get-Process YuiTracking -ErrorAction SilentlyContinue) { throw 'Close YuiTracking before testing the installer.' }
$settings = Join-Path $env:LOCALAPPDATA 'YuiTracking\settings.json'
$settingsHash = (Get-FileHash -LiteralPath $settings).Hash
$model = (Get-Content -LiteralPath $settings -Raw | ConvertFrom-Json).defaultVrmPath
$modelHash = (Get-FileHash -LiteralPath $model).Hash
$cameraKey = 'HKCU:\Software\Classes\CLSID\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance\{5C2CD55C-92AD-4999-8666-912BD3E7003B}'
$cameraWasRegistered = Test-Path $cameraKey
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'YuiTracking.lnk'
if (Test-Path $shortcut) { throw 'A pre-existing shortcut would be replaced by this test.' }
function Check($condition, $message) {
    if (-not $condition) { throw $message }
    Write-Host "PASS $message"
}
function RunSetup($logName) {
    $arguments = "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /DIR=`"$testDir`" /LOG=`"$projectRoot\artifacts\$logName.log`""
    $process = Start-Process -FilePath $installer -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
    Check ($process.ExitCode -eq 0) "installer exit code $($process.ExitCode)"
}
Push-Location $projectRoot
try {
    RunSetup 'installer-fresh'
    Check (Test-Path "$testDir\YuiTracking.exe") 'application files installed'
    Check (Test-Path "$testDir\YuiTracking.pri") 'WinUI resources installed'
    Check (Test-Path $shortcut) 'Start menu shortcut installed'
    Check ((Get-ItemProperty -LiteralPath $cameraKey).FriendlyName -eq 'YuiTracking Camera') 'virtual camera registered'
    Check (-not (Test-Path "$testDir\settings.json")) 'personal configuration not bundled'
    Check (-not (Get-ChildItem -LiteralPath $testDir -Recurse -Filter '*.vrm')) 'personal VRM not bundled'
    $app = Start-Process -FilePath "$testDir\YuiTracking.exe" -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 5
    $app.Refresh()
    Check (-not $app.HasExited -and $app.MainWindowTitle -eq 'YuiTracking — VTuber Studio') 'installed WinUI app starts'
    $app.CloseMainWindow() | Out-Null
    Check ($app.WaitForExit(10000)) 'installed app closes normally'
    RunSetup 'installer-upgrade'
    Check ((Get-FileHash -LiteralPath $settings).Hash -eq $settingsHash) 'upgrade preserves VRM settings'
    # This exact uninstaller was created by the test, under the checked workspace path.
    $uninstall = Start-Process -FilePath "$testDir\unins000.exe" -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -WindowStyle Hidden -PassThru -Wait
    Check ($uninstall.ExitCode -eq 0) 'uninstaller exit code'
    Check (-not (Test-Path "$testDir\YuiTracking.exe")) 'application removed'
    Check (-not (Test-Path $shortcut)) 'Start menu shortcut removed'
    Check (-not (Test-Path $cameraKey)) 'dedicated camera registration removed'
    Check ((Get-FileHash -LiteralPath $settings).Hash -eq $settingsHash) 'uninstall preserves settings'
    Check ((Get-FileHash -LiteralPath $model).Hash -eq $modelHash) 'uninstall preserves original VRM'
} finally {
    if ($cameraWasRegistered) {
        & .tools/dotnet/dotnet.exe run --project tests/CameraSmoke/CameraSmoke.csproj -- --register
    }
    Pop-Location
}
