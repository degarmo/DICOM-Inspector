#Requires -Version 7.2
<#
.SYNOPSIS
    Install the NSIS installer silently, exercise it with Python off PATH, then uninstall.

.DESCRIPTION
    1. Silent per-user install.
    2. Checks the installed files and Start menu shortcut.
    3. Runs the installed engine exe against two Phase 1 fixtures with a PATH that
       contains only Windows system directories (no Python): expects exit 0 + valid
       JSON for a real pair, exit 2 + a JSON error for a non-DICOM file.
    4. Launches the installed app and checks it stays up.
    5. Silent uninstall, then checks the install directory, shortcut, uninstall
       registry entry and app data are gone.

.PARAMETER Installer
    Path to DICOM-Inspector-Setup-<version>.exe. Defaults to the one in release/.

.PARAMETER Fixtures
    Directory with the Phase 1 fixtures (created by build_engine.ps1).
#>
[CmdletBinding()]
param(
    [string]$Installer = '',
    [string]$Fixtures = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
if (-not $Installer) {
    $version = (Get-Content (Join-Path $Root 'app/package.json') -Raw | ConvertFrom-Json).version
    $Installer = Join-Path $Root "release/DICOM-Inspector-Setup-$version.exe"
}
if (-not $Fixtures) { $Fixtures = Join-Path $Root 'engine/tests/fixtures' }
$UninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$StartMenuLink = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DICOM Inspector.lnk'
# Electron's userData folder (named after productName); the package name is checked too.
$AppDataDirs = @((Join-Path $env:APPDATA 'DICOM Inspector'), (Join-Path $env:APPDATA 'dicom-inspector-app'))
# A PATH with nothing but Windows itself, so no Python can be found.
$SystemOnlyPath = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\Wbem"

function Get-UninstallEntry {
    Get-ChildItem $UninstallRoot -ErrorAction SilentlyContinue |
        Get-ItemProperty |
        Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like 'DICOM Inspector*' }
}

function Invoke-Engine {
    param([string]$Exe, [string[]]$Arguments)
    $info = [System.Diagnostics.ProcessStartInfo]::new($Exe)
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $info.WorkingDirectory = Split-Path -Parent $Exe
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.Environment['PATH'] = $SystemOnlyPath
    foreach ($name in @('PYTHONHOME', 'PYTHONPATH', 'DICOM_INSPECTOR_PYTHON')) { [void]$info.Environment.Remove($name) }
    $process = [System.Diagnostics.Process]::Start($info)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(60000)) { $process.Kill($true); throw 'Installed engine did not exit within 60 seconds.' }
    [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.Result; Stderr = $stderr.Result }
}

function Assert-That {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "SMOKE TEST FAILED: $Message" }
    Write-Host "  ok  $Message"
}

if (-not (Test-Path $Installer)) { throw "Installer not found: $Installer" }
if (Get-UninstallEntry) { throw 'DICOM Inspector is already installed for this user; uninstall it first.' }

Write-Host "==> Installing silently (per user): $Installer"
$install = Start-Process -FilePath $Installer -ArgumentList '/S', '/currentuser' -Wait -PassThru
Assert-That ($install.ExitCode -eq 0) "installer exited with 0 (got $($install.ExitCode))"

$entry = Get-UninstallEntry
Assert-That ($null -ne $entry) 'uninstall registry entry exists'
$quiet = $entry.QuietUninstallString
Assert-That ([bool]$quiet) 'QuietUninstallString is registered'
# The uninstaller lives in the install directory.
$uninstaller = ($quiet -split '"')[1]
$InstallDir = Split-Path -Parent $uninstaller
$AppExe = Join-Path $InstallDir 'DICOM Inspector.exe'
$EngineExe = Join-Path $InstallDir 'resources\engine\dicom_inspector_engine.exe'

Write-Host "==> Checking installed files in $InstallDir"
Assert-That (Test-Path $AppExe) 'app executable installed'
Assert-That (Test-Path $EngineExe) 'frozen engine installed in resources\engine (outside app.asar)'
Assert-That (Test-Path (Join-Path $InstallDir 'resources\app.asar')) 'app.asar installed'
Assert-That (Test-Path (Join-Path $InstallDir 'THIRD_PARTY_NOTICES.txt')) 'THIRD_PARTY_NOTICES.txt installed'
Assert-That (-not (Test-Path (Join-Path $InstallDir 'resources\app-update.yml'))) 'no auto-update feed (app-update.yml absent)'
Assert-That (Test-Path $StartMenuLink) 'Start menu shortcut created'

Write-Host '==> Running the installed engine with Python off PATH'
$pair = Invoke-Engine $EngineExe @('compare', (Join-Path $Fixtures '01_study_uid_a.dcm'), (Join-Path $Fixtures '01_study_uid_b.dcm'))
Assert-That ($pair.ExitCode -eq 0) "compare of 01_study_uid exited with 0 (got $($pair.ExitCode); stderr: $($pair.Stderr))"
$report = $pair.Stdout | ConvertFrom-Json
Assert-That ($report.schema_version -eq '1.0') 'stdout is valid JSON with schema_version 1.0'
Assert-That ($report.summary.different -eq 1 -and $report.summary.priority_mismatches -eq 1) 'summary reports the planted StudyInstanceUID difference'

$bad = Invoke-Engine $EngineExe @('compare', (Join-Path $Fixtures '09_not_dicom_a.dcm'), (Join-Path $Fixtures '09_not_dicom_b.txt'))
Assert-That ($bad.ExitCode -eq 2) "non-DICOM input exited with 2 (got $($bad.ExitCode))"
Assert-That ((($bad.Stderr | ConvertFrom-Json).error.code) -eq 'not_dicom') 'stderr is a JSON error with code not_dicom'

Write-Host '==> Launching the installed app'
$launch = [System.Diagnostics.ProcessStartInfo]::new($AppExe)
$launch.UseShellExecute = $false
$launch.Environment['PATH'] = $SystemOnlyPath
$app = [System.Diagnostics.Process]::Start($launch)
Start-Sleep -Seconds 10
Assert-That (-not $app.HasExited) 'app is still running after 10 seconds'
$app.Kill($true)
$app.WaitForExit(15000) | Out-Null
Start-Sleep -Seconds 2

Write-Host '==> Uninstalling silently'
$uninstallArgs = ($quiet.Substring($quiet.LastIndexOf('"') + 1).Trim() -split '\s+') | Where-Object { $_ }
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList $uninstallArgs -Wait -PassThru
Assert-That ($uninstall.ExitCode -eq 0) "uninstaller exited with 0 (got $($uninstall.ExitCode))"

# The NSIS uninstaller re-launches itself from %TEMP%; wait for it to finish removing files.
$deadline = (Get-Date).AddSeconds(90)
while ((Test-Path $InstallDir) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
Assert-That (-not (Test-Path $InstallDir)) "install directory removed ($InstallDir)"
Assert-That ($null -eq (Get-UninstallEntry)) 'uninstall registry entry removed'
Assert-That (-not (Test-Path $StartMenuLink)) 'Start menu shortcut removed'
foreach ($dir in $AppDataDirs) { Assert-That (-not (Test-Path $dir)) "app data removed ($dir)" }

Write-Host ''
Write-Host 'SMOKE TEST PASSED' -ForegroundColor Green
