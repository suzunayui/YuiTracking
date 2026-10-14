param([string]$DevelopmentLayout, [string]$PackageName = 'YuiTracking.CompatibilityProbe', [switch]$Installed)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$registeredByTest = $false
try {
if ($DevelopmentLayout) {
    if ((Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense -ne 1) { throw 'Enable Windows Developer Mode yourself before running the loose-layout test.' }
    $baseLayout = (Resolve-Path -LiteralPath $DevelopmentLayout).Path
    $probePublish = Join-Path $projectRoot 'dist/msix/probe-publish'
    & dotnet publish "$projectRoot/tests/MsixProbe/MsixProbe.csproj" -c Release -o $probePublish -v quiet
    if ($LASTEXITCODE) { throw 'Probe publish failed.' }
    $fixtureId = [guid]::NewGuid().ToString('N')
    $fixture = Join-Path $projectRoot "dist/msix/probe-layouts/$fixtureId"
    New-Item -ItemType Directory $fixture | Out-Null
    Copy-Item -Path "$probePublish/*" -Destination $fixture -Recurse
    New-Item -ItemType Directory -Force "$fixture/Assets/Msix" | Out-Null
    Copy-Item -Path "$baseLayout/Assets/Msix/*" -Destination "$fixture/Assets/Msix"
    $manifest = [xml](Get-Content -LiteralPath "$baseLayout/AppxManifest.xml" -Raw -Encoding UTF8)
    $PackageName = "YuiTracking.Probe.$fixtureId"
    $manifest.Package.Identity.Name = $PackageName
    $manifest.Package.Applications.Application.Executable = 'MsixProbe.exe'
    $manifest.Save("$fixture/AppxManifest.xml")
    Add-AppxPackage -Register "$fixture/AppxManifest.xml"
    $registeredByTest = $true
}
$package = Get-AppxPackage -Name $PackageName
if (@($package).Count -ne 1) { throw 'Register exactly one compatibility probe package before running this test.' }
$executable = Join-Path $package.InstallLocation 'MsixProbe.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw 'This test requires the test-only MsixProbe executable, not the production app.' }
$taskId = [guid]::NewGuid().ToString('N')
$taskDirectory = Join-Path ([IO.Path]::GetTempPath()) "YuiTracking-MsixProbe-$taskId"
New-Item -ItemType Directory $taskDirectory | Out-Null
$reportPath = Join-Path $taskDirectory 'report.json'
$dataPath = Join-Path $env:LOCALAPPDATA "YuiTracking\msix-probe-$taskId.txt"
$probeName = "Local\YuiTracking.MsixProbe.$taskId"
$done = $null
try {
    $arguments = @($taskId, $reportPath)
    if ($Installed) {
        Invoke-CommandInDesktopPackage -PackageFamilyName $package.PackageFamilyName -AppId App -Command $executable -Args "$taskId `"$reportPath`"" -PreventBreakaway
    } else {
        ConvertTo-Json -InputObject $arguments -Compress | Set-Content -LiteralPath (Join-Path $package.InstallLocation 'probe-task.json')
        Start-Process explorer.exe -ArgumentList "shell:AppsFolder\$($package.PackageFamilyName)!App" -WindowStyle Hidden
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while (-not (Test-Path -LiteralPath $reportPath)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Packaged probe did not start.' }
        Start-Sleep -Milliseconds 100
    }
    $report = Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($report.error) { throw $report.error }
    $done = [Threading.EventWaitHandle]::OpenExisting($probeName + '.done')
    $consumerReport = Join-Path $taskDirectory 'consumer.json'
    $consumer = (Resolve-Path -LiteralPath "$projectRoot/dist/msix/probe-publish/MsixProbe.exe").Path
    # A child of a packaged terminal can inherit its virtualized registry view even
    # when it has no package identity. Launch through Explorer for an independent consumer.
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path $taskDirectory 'consumer.lnk'))
    $link.TargetPath = $consumer
    $link.Arguments = "read $taskId `"$consumerReport`""
    $link.Save()
    Start-Process explorer.exe -ArgumentList "`"$($link.FullName)`"" -WindowStyle Hidden
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $consumerReport)) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Independent consumer did not start.' }
        Start-Sleep -Milliseconds 100
    }
    $external = Get-Content -LiteralPath $consumerReport -Raw -Encoding UTF8 | ConvertFrom-Json
    $checks = [ordered]@{
        packageIdentity = $report.identity -eq $package.Name
        independentConsumer = $external.consumerIdentity -eq 'unpackaged'
        cameraRegistry0 = $external.cameraRegistry0
        cameraRegistry1 = $external.cameraRegistry1
        sharedAppData = $external.sharedAppData
        sharedMemory = $external.sharedMemory
    }
    $checks.sharedEvent = $done.Set()
    $checks | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskDirectory 'checks.json')
    $checks | ConvertTo-Json
    if ($checks.Values -contains $false) { throw "MSIX compatibility probe failed; see $taskDirectory" }
    Write-Host 'PASS package identity, external camera registry, shared AppData, shared memory/events'
} finally {
    if ($done) {
        $null=$done.Set(); $done.Dispose()
        $cleanupDeadline = [DateTime]::UtcNow.AddSeconds(10)
        while (-not (Test-Path -LiteralPath ($reportPath + '.finished'))) {
            if ([DateTime]::UtcNow -gt $cleanupDeadline) { throw 'Probe cleanup did not finish.' }
            Start-Sleep -Milliseconds 100
        }
    }
    # The packaged producer removes its own random registry values on completion.
    if (Test-Path -LiteralPath $dataPath) { Remove-Item -LiteralPath $dataPath }
}
} finally {
    if ($registeredByTest) {
        $fixturePackage = Get-AppxPackage -Name $PackageName
        if ($fixturePackage.Name -eq "YuiTracking.Probe.$fixtureId") { Remove-AppxPackage -Package $fixturePackage.PackageFullName }
    }
}
