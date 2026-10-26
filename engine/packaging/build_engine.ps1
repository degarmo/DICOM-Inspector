#Requires -Version 7.2
<#
.SYNOPSIS
    Freeze the DICOM Inspector engine with PyInstaller (onedir) and smoke-test it.

.DESCRIPTION
    1. Creates a clean virtual environment in engine/.build-venv.
    2. Installs the hash-pinned dependencies from engine/requirements-lock.txt.
    3. Runs PyInstaller with engine/packaging/dicom_inspector_engine.spec.
    4. Generates the Phase 1 fixtures and runs the frozen exe against two pairs,
       checking exit codes and JSON.

    Output: engine/dist/dicom_inspector_engine/dicom_inspector_engine.exe

.PARAMETER Python
    Python 3.11+ interpreter used to create the build venv. Defaults to "python" on PATH.
#>
[CmdletBinding()]
param(
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$EngineDir = Split-Path -Parent $PSScriptRoot
$VenvDir = Join-Path $EngineDir '.build-venv'
$DistDir = Join-Path $EngineDir 'dist'
$WorkDir = Join-Path $EngineDir 'build/pyinstaller'
$IsWin = [System.Environment]::OSVersion.Platform -eq 'Win32NT'
$VenvPython = if ($IsWin) { Join-Path $VenvDir 'Scripts/python.exe' } else { Join-Path $VenvDir 'bin/python' }
$ExeName = if ($IsWin) { 'dicom_inspector_engine.exe' } else { 'dicom_inspector_engine' }
$Exe = Join-Path $DistDir "dicom_inspector_engine/$ExeName"

function Invoke-Checked {
    param([string]$What, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE." }
}

function Invoke-Engine {
    <# Run the frozen engine with an argument array; return exit code, stdout and stderr. #>
    param([string[]]$Arguments)
    $info = [System.Diagnostics.ProcessStartInfo]::new($Exe)
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $info.WorkingDirectory = Split-Path -Parent $Exe
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $process = [System.Diagnostics.Process]::Start($info)
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(60000)) {
        $process.Kill($true)
        throw "Frozen engine did not exit within 60 seconds: $($Arguments -join ' ')"
    }
    [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.Result; Stderr = $stderr.Result }
}

Push-Location $EngineDir
try {
    Write-Host '==> Checking Python'
    if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
        throw "Python interpreter '$Python' was not found. Install Python 3.11+ or pass -Python <path to python.exe>."
    }
    # No quotes inside the -c program, so argument passing cannot mangle it.
    $version = & $Python -c 'import sys; print(*sys.version_info[:2], sep=chr(46)); raise SystemExit(sys.version_info < (3, 11))'
    if ($LASTEXITCODE -ne 0) { throw "Python 3.11+ is required; '$Python' is $version." }
    Write-Host "    $Python is Python $version"

    Write-Host '==> Creating a clean build venv'
    foreach ($dir in @($VenvDir, $DistDir, $WorkDir)) {
        if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    }
    Invoke-Checked 'Creating the venv' { & $Python -m venv $VenvDir }

    Write-Host '==> Installing pinned dependencies (requirements-lock.txt, hashes required)'
    Invoke-Checked 'Installing dependencies' {
        & $VenvPython -m pip install --disable-pip-version-check --no-input --require-hashes --only-binary=:all: -r (Join-Path $EngineDir 'requirements-lock.txt')
    }

    Write-Host '==> Running PyInstaller'
    Invoke-Checked 'PyInstaller' {
        & $VenvPython -m PyInstaller --noconfirm --clean --distpath $DistDir --workpath $WorkDir (Join-Path $PSScriptRoot 'dicom_inspector_engine.spec')
    }
    if (-not (Test-Path $Exe)) { throw "PyInstaller finished but $Exe was not produced." }

    Write-Host '==> Generating Phase 1 fixtures'
    Invoke-Checked 'Generating fixtures' { & $VenvPython (Join-Path $EngineDir 'tests/make_fixtures.py') | Out-Null }
    $Fixtures = Join-Path $EngineDir 'tests/fixtures'

    Write-Host '==> Smoke test: compare 01_study_uid (expect exit 0 and one priority difference)'
    $ok = Invoke-Engine @('compare', (Join-Path $Fixtures '01_study_uid_a.dcm'), (Join-Path $Fixtures '01_study_uid_b.dcm'))
    if ($ok.ExitCode -ne 0) { throw "Frozen engine exited with $($ok.ExitCode). stderr: $($ok.Stderr)" }
    $report = $ok.Stdout | ConvertFrom-Json
    if ($report.schema_version -ne '1.0') { throw "Unexpected schema_version '$($report.schema_version)'." }
    if ($report.summary.different -ne 1 -or $report.summary.priority_mismatches -ne 1) {
        throw "Unexpected summary: $($report.summary | ConvertTo-Json -Compress)"
    }

    Write-Host '==> Smoke test: compare 09_not_dicom (expect exit 2 and a JSON error)'
    $bad = Invoke-Engine @('compare', (Join-Path $Fixtures '09_not_dicom_a.dcm'), (Join-Path $Fixtures '09_not_dicom_b.txt'))
    if ($bad.ExitCode -ne 2) { throw "Expected exit 2 for a non-DICOM file, got $($bad.ExitCode)." }
    $errorDoc = $bad.Stderr | ConvertFrom-Json
    if ($errorDoc.error.code -ne 'not_dicom') { throw "Expected error code not_dicom, got '$($errorDoc.error.code)'." }

    $size = (Get-ChildItem -Recurse -File (Split-Path -Parent $Exe) | Measure-Object -Property Length -Sum).Sum
    Write-Host ('==> Engine built: {0} ({1:N1} MB onedir)' -f $Exe, ($size / 1MB))
}
finally {
    Pop-Location
}
