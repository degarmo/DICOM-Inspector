#Requires -Version 7.2
<#
.SYNOPSIS
    Build the DICOM Inspector Windows installer from a clean clone.

.DESCRIPTION
    1. Freeze the engine (engine/packaging/build_engine.ps1)
    2. Verify the frozen engine against python -m dicom_inspector (verify_frozen.py)
    3. npm ci, npm test and npm run lint in app/
    4. Generate THIRD_PARTY_NOTICES.txt
    5. Build the app and the NSIS installer with electron-builder
    6. Check the installer exists

    Output: release/DICOM-Inspector-Setup-<version>.exe

    Code signing is enabled only when CSC_LINK and CSC_KEY_PASSWORD are set.
    Stops at the first failing step and names it.

.PARAMETER Python
    Python 3.11+ interpreter used to build the engine. Defaults to "python" on PATH.
#>
[CmdletBinding()]
param(
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$EngineDir = Join-Path $Root 'engine'
$AppDir = Join-Path $Root 'app'
$VenvPython = Join-Path $EngineDir '.build-venv/Scripts/python.exe'
$Steps = 6
$script:Step = 0

function Invoke-Checked {
    param([string]$What, [scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE." }
}

function Invoke-Step {
    param([string]$Name, [scriptblock]$Body)
    $script:Step++
    Write-Host ''
    Write-Host "[$script:Step/$Steps] $Name" -ForegroundColor Cyan
    try {
        & $Body
    }
    catch {
        Write-Host ''
        Write-Host "BUILD FAILED at step $script:Step/$Steps ($Name)" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

if (-not $IsWindows) {
    Write-Host 'This script builds the Windows installer and must run on Windows.' -ForegroundColor Red
    exit 1
}
foreach ($tool in @('node', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "'$tool' was not found on PATH. Install Node.js LTS." -ForegroundColor Red
        exit 1
    }
}

# An empty secret in CI arrives as an empty variable; treat it as absent.
foreach ($name in @('CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD')) {
    if ((Test-Path "Env:$name") -and -not (Get-Item "Env:$name").Value) { Remove-Item "Env:$name" }
}
$signing = [bool]($env:CSC_LINK -or $env:WIN_CSC_LINK)
Write-Host ('Code signing: {0}' -f ($(if ($signing) { 'enabled (certificate from CSC_LINK)' } else { 'disabled (CSC_LINK not set); the installer will be unsigned' })))

$Version = (Get-Content (Join-Path $AppDir 'package.json') -Raw | ConvertFrom-Json).version
$Installer = Join-Path $Root "release/DICOM-Inspector-Setup-$Version.exe"

Invoke-Step 'Freeze the engine (PyInstaller onedir)' {
    Invoke-Checked 'build_engine.ps1' { & pwsh -NoProfile -File (Join-Path $EngineDir 'packaging/build_engine.ps1') -Python $Python }
}

Invoke-Step 'Verify the frozen engine matches python -m dicom_inspector' {
    Invoke-Checked 'verify_frozen.py' { & $VenvPython (Join-Path $EngineDir 'packaging/verify_frozen.py') }
}

Invoke-Step 'Install, test and lint the app' {
    Push-Location $AppDir
    try {
        Invoke-Checked 'npm ci' { & npm ci --no-audit --no-fund }
        # Point the real-engine integration test at the build venv so it runs, not skips.
        $env:DICOM_INSPECTOR_PYTHON = $VenvPython
        Invoke-Checked 'npm test' { & npm test }
        Invoke-Checked 'npm run lint' { & npm run lint }
    }
    finally {
        Remove-Item Env:DICOM_INSPECTOR_PYTHON -ErrorAction SilentlyContinue
        Pop-Location
    }
}

Invoke-Step 'Generate THIRD_PARTY_NOTICES.txt' {
    Invoke-Checked 'generate_notices.py' { & $VenvPython (Join-Path $PSScriptRoot 'generate_notices.py') }
}

Invoke-Step 'Build the app and the NSIS installer (electron-builder)' {
    if (Test-Path $Installer) { Remove-Item -Force $Installer }
    Push-Location $AppDir
    try {
        Invoke-Checked 'electron-builder' { & npm run dist:win }
    }
    finally {
        Pop-Location
    }
}

Invoke-Step 'Check the installer' {
    if (-not (Test-Path $Installer)) { throw "Expected installer not found: $Installer" }
    $item = Get-Item $Installer
    $hash = (Get-FileHash -Algorithm SHA256 $Installer).Hash.ToLowerInvariant()
    Write-Host ('Installer: {0}' -f $item.FullName)
    Write-Host ('Size:      {0:N1} MB ({1:N0} bytes)' -f ($item.Length / 1MB), $item.Length)
    Write-Host ('SHA-256:   {0}' -f $hash)
    Write-Host ('Signed:    {0}' -f (Get-AuthenticodeSignature $Installer).Status)
}

Write-Host ''
Write-Host 'BUILD SUCCEEDED' -ForegroundColor Green
