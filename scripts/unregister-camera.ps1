$ErrorActionPreference = 'Stop'
# Remove only this app's dedicated per-user slot. Never unregister Unity Capture globally.
$classId = '{5C2CD55C-92AD-4999-8666-912BD3E7003B}'
$classPath = "HKCU:\Software\Classes\CLSID\$classId"
$expectedDll = Join-Path $env:LOCALAPPDATA 'YuiTracking\VirtualCamera\UnityCaptureFilter64.dll'
$key = Get-Item -LiteralPath "$classPath\InprocServer32" -ErrorAction SilentlyContinue
if ($null -eq $key) { Write-Host 'YuiTracking camera is not registered.'; exit }
$legacyDll = Join-Path $env:LOCALAPPDATA 'HoloTrack\VirtualCamera\UnityCaptureFilter64.dll'
if ($key.GetValue('') -notin @($expectedDll, $legacyDll)) { throw 'This slot belongs to another registration; nothing was changed.' }
Remove-Item -LiteralPath "$classPath\InprocServer32"
Remove-Item -LiteralPath $classPath
$devicePath = "HKCU:\Software\Classes\CLSID\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\Instance\$classId"
if (Test-Path -LiteralPath $devicePath) { Remove-Item -LiteralPath $devicePath }
Write-Host 'YuiTracking camera unregistered. Restart OBS to refresh its device list.'
