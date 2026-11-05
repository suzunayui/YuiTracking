# Sets the Windows app version to year.MMdd.N, where N counts releases on that date.
# Month and day have no leading zero (2027.105.1), because .NET normalizes version parts.
param(
    [datetime]$Date = (Get-Date),
    [string]$ProjectPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'src/YuiTracking.App/YuiTracking.App.csproj')
)
$ErrorActionPreference = 'Stop'
$path = (Resolve-Path -LiteralPath $ProjectPath).Path
$pattern = '<Version>(\d+\.\d+)\.(\d+)</Version>'
$bytes = [IO.File]::ReadAllBytes($path)
$hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
$encoding = New-Object System.Text.UTF8Encoding($hasBom)
$text = [IO.File]::ReadAllText($path, $encoding)
$found = [regex]::Matches($text, $pattern)
if ($found.Count -ne 1) { throw "Expected one <Version> in $path, found $($found.Count)." }

$current = "$($found[0].Groups[1].Value).$($found[0].Groups[2].Value)"
$datePart = "$($Date.Year).$($Date.Month * 100 + $Date.Day)"
$number = if ($found[0].Groups[1].Value -eq $datePart) { [int]$found[0].Groups[2].Value + 1 } else { 1 }
$next = "$datePart.$number"
if ([version]$next -le [version]$current) { throw "New version $next is not newer than $current." }

[IO.File]::WriteAllText($path, $text.Replace($found[0].Value, "<Version>$next</Version>"), $encoding)
Write-Host "Version: $current -> $next"
