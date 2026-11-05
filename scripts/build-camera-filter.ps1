param([string]$PlatformToolset = 'v145', [string]$WindowsSdkVersion = '10.0.26100.0')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$msbuild = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
if (-not $msbuild) { throw 'Visual Studio C++ build tools are required.' }
& $msbuild (Join-Path $root 'native/UnityCapture/UnityCaptureFilter.vcxproj') /m /v:minimal /p:Configuration=Release /p:Platform=x64 "/p:PlatformToolset=$PlatformToolset" "/p:WindowsTargetPlatformVersion=$WindowsSdkVersion" "/p:OutDir=$root\dist\native\" "/p:IntDir=$root\dist\native\obj\"
if ($LASTEXITCODE) { throw 'Native camera build failed.' }
Copy-Item -LiteralPath (Join-Path $root 'dist/native/UnityCaptureFilter64.dll') -Destination (Join-Path $root 'src/YuiTracking.App/Assets/VirtualCamera/UnityCaptureFilter64.dll')
