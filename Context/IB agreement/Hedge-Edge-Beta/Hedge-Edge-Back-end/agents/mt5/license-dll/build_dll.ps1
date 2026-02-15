# ============================================================================
# Hedge Edge MT5 DLL Build Script
# ============================================================================
# This script compiles HedgeEdgeLicense.dll using CMake and Visual Studio
# 
# Prerequisites:
#   - Visual Studio 2019 or later with C++ Desktop workload
#   - CMake (comes with Visual Studio or install separately)
#   - Windows SDK
# 
# Usage:
#   .\build_dll.ps1              # Build Release x64
#   .\build_dll.ps1 -Clean       # Clean and rebuild
#   .\build_dll.ps1 -Debug       # Build Debug x64
#   .\build_dll.ps1 -Deploy      # Build and deploy to MT5 terminals
# ============================================================================

param(
    [switch]$Clean,
    [switch]$Debug,
    [switch]$Deploy,
    [switch]$Help
)

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir = Join-Path $ScriptDir "build"
$BuildConfig = if ($Debug) { "Debug" } else { "Release" }

# Visual Studio versions to search for
$VSVersions = @(
    "Visual Studio 17 2022",  # VS 2022
    "Visual Studio 16 2019"   # VS 2019
)

# ============================================================================
# Functions
# ============================================================================

function Write-Banner {
    param([string]$Message)
    $line = "=" * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor White
    Write-Host $line -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-Host "[*] $Message" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[!] ERROR: $Message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "[!] WARNING: $Message" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

function Show-Help {
    Write-Host @"
Hedge Edge MT5 DLL Build Script

USAGE:
    .\build_dll.ps1 [OPTIONS]

OPTIONS:
    -Clean      Clean the build directory before building
    -Debug      Build Debug configuration (default is Release)
    -Deploy     Build and deploy to all detected MT5 terminals
    -Help       Show this help message

EXAMPLES:
    .\build_dll.ps1                # Build Release x64
    .\build_dll.ps1 -Clean         # Clean rebuild
    .\build_dll.ps1 -Deploy        # Build and deploy to MT5
    .\build_dll.ps1 -Debug -Clean  # Clean Debug build

PREREQUISITES:
    - Visual Studio 2019+ with C++ Desktop workload
    - CMake (included with Visual Studio)
    - Windows SDK

"@
}

function Find-CMake {
    # Check if cmake is in PATH
    $cmake = Get-Command cmake -ErrorAction SilentlyContinue
    if ($cmake) {
        return $cmake.Source
    }
    
    # Search in common Visual Studio locations
    $programFiles = @($env:ProgramFiles, ${env:ProgramFiles(x86)})
    
    foreach ($pf in $programFiles) {
        $vsPath = Join-Path $pf "Microsoft Visual Studio"
        if (Test-Path $vsPath) {
            $cmakeExe = Get-ChildItem -Path $vsPath -Recurse -Filter "cmake.exe" -ErrorAction SilentlyContinue | 
                        Where-Object { $_.FullName -match "CMake" } |
                        Select-Object -First 1
            if ($cmakeExe) {
                return $cmakeExe.FullName
            }
        }
    }
    
    # Check CMake default installation
    $defaultCMake = "C:\Program Files\CMake\bin\cmake.exe"
    if (Test-Path $defaultCMake) {
        return $defaultCMake
    }
    
    return $null
}

function Find-VisualStudioGenerator {
    foreach ($vs in $VSVersions) {
        # Check if we can use this generator by running cmake
        $testDir = Join-Path $env:TEMP "cmake_test_$(Get-Random)"
        New-Item -ItemType Directory -Path $testDir -Force | Out-Null
        
        try {
            Push-Location $testDir
            $result = & $script:CMakePath -G $vs -A x64 --version 2>&1
            Pop-Location
            
            if ($LASTEXITCODE -eq 0 -or $result -match "cmake version") {
                return $vs
            }
        }
        catch {
            # Generator not available
        }
        finally {
            if (Test-Path $testDir) {
                Remove-Item -Path $testDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
    
    return $null
}

function Find-MT5Terminals {
    $terminals = @()
    
    # Check AppData for MT5 data folders
    $mt5DataPath = Join-Path $env:APPDATA "MetaQuotes\Terminal"
    
    if (Test-Path $mt5DataPath) {
        $terminalDirs = Get-ChildItem -Path $mt5DataPath -Directory | Where-Object {
            # Each terminal has a unique hash-based folder name
            $_.Name -match "^[A-F0-9]{32}$"
        }
        
        foreach ($dir in $terminalDirs) {
            $librariesPath = Join-Path $dir.FullName "MQL5\Libraries"
            $expertsPath = Join-Path $dir.FullName "MQL5\Experts"
            
            if ((Test-Path $librariesPath) -or (Test-Path $expertsPath)) {
                $terminals += @{
                    Id = $dir.Name
                    Path = $dir.FullName
                    LibrariesPath = $librariesPath
                    ExpertsPath = $expertsPath
                }
            }
        }
    }
    
    return $terminals
}

function Build-DLL {
    Write-Banner "Building Hedge Edge License DLL"
    
    # Find CMake
    Write-Step "Locating CMake..."
    $script:CMakePath = Find-CMake
    
    if (-not $CMakePath) {
        Write-Error-Custom "CMake not found. Please install Visual Studio with C++ workload or CMake separately."
        return $false
    }
    Write-Info "Found: $CMakePath"
    
    # Find Visual Studio Generator
    Write-Step "Detecting Visual Studio..."
    $generator = Find-VisualStudioGenerator
    
    if (-not $generator) {
        Write-Error-Custom "No supported Visual Studio installation found."
        Write-Info "Please install Visual Studio 2019 or later with C++ Desktop Development workload."
        return $false
    }
    Write-Info "Using: $generator"
    
    # Clean if requested
    if ($Clean -and (Test-Path $BuildDir)) {
        Write-Step "Cleaning build directory..."
        Remove-Item -Path $BuildDir -Recurse -Force
    }
    
    # Create build directory
    if (-not (Test-Path $BuildDir)) {
        New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null
    }
    
    # Configure with CMake
    Write-Step "Configuring CMake project..."
    Push-Location $BuildDir
    
    $configArgs = @(
        "-G", $generator,
        "-A", "x64",
        ".."
    )
    
    & $CMakePath $configArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "CMake configuration failed"
        Pop-Location
        return $false
    }
    
    # Build
    Write-Step "Building $BuildConfig configuration..."
    & $CMakePath --build . --config $BuildConfig
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "Build failed"
        Pop-Location
        return $false
    }
    
    Pop-Location
    
    # Verify output
    $dllPath = Join-Path $ScriptDir "HedgeEdgeLicense.dll"
    if (Test-Path $dllPath) {
        Write-Step "Build successful!"
        Write-Info "Output: $dllPath"
        
        # Show DLL info
        $dllInfo = Get-Item $dllPath
        Write-Info "Size: $([math]::Round($dllInfo.Length / 1KB, 2)) KB"
        Write-Info "Modified: $($dllInfo.LastWriteTime)"
        
        return $true
    }
    else {
        Write-Error-Custom "DLL not found after build"
        return $false
    }
}

function Deploy-ToMT5 {
    Write-Banner "Deploying to MT5 Terminals"
    
    $dllPath = Join-Path $ScriptDir "HedgeEdgeLicense.dll"
    $mq5Path = Join-Path $ScriptDir "HedgeEdgeLicense.mq5"
    
    # Verify source files exist
    if (-not (Test-Path $dllPath)) {
        Write-Error-Custom "HedgeEdgeLicense.dll not found. Run build first."
        return $false
    }
    
    if (-not (Test-Path $mq5Path)) {
        Write-Warning-Custom "HedgeEdgeLicense.mq5 not found. Only deploying DLL."
    }
    
    # Find MT5 terminals
    Write-Step "Scanning for MT5 terminals..."
    $terminals = Find-MT5Terminals
    
    if ($terminals.Count -eq 0) {
        Write-Warning-Custom "No MT5 terminals found in AppData."
        Write-Info "MT5 data typically located at: $env:APPDATA\MetaQuotes\Terminal\"
        Write-Info "You can manually copy the files:"
        Write-Info "  - HedgeEdgeLicense.dll -> MQL5\Libraries\"
        Write-Info "  - HedgeEdgeLicense.mq5 -> MQL5\Experts\"
        return $false
    }
    
    Write-Info "Found $($terminals.Count) MT5 terminal(s)"
    
    # Deploy to each terminal
    $deployed = 0
    foreach ($terminal in $terminals) {
        Write-Host ""
        Write-Step "Deploying to terminal: $($terminal.Id.Substring(0, 8))..."
        
        # Create directories if needed
        if (-not (Test-Path $terminal.LibrariesPath)) {
            New-Item -ItemType Directory -Path $terminal.LibrariesPath -Force | Out-Null
        }
        if (-not (Test-Path $terminal.ExpertsPath)) {
            New-Item -ItemType Directory -Path $terminal.ExpertsPath -Force | Out-Null
        }
        
        # Copy DLL
        try {
            Copy-Item -Path $dllPath -Destination $terminal.LibrariesPath -Force
            Write-Info "Copied DLL to Libraries"
        }
        catch {
            Write-Warning-Custom "Failed to copy DLL: $_"
        }
        
        # Copy MQ5
        if (Test-Path $mq5Path) {
            try {
                Copy-Item -Path $mq5Path -Destination $terminal.ExpertsPath -Force
                Write-Info "Copied MQ5 to Experts"
            }
            catch {
                Write-Warning-Custom "Failed to copy MQ5: $_"
            }
        }
        
        $deployed++
    }
    
    Write-Host ""
    Write-Step "Deployment complete! Deployed to $deployed terminal(s)."
    Write-Host ""
    Write-Host "NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Open MetaTrader 5" -ForegroundColor White
    Write-Host "  2. Open MetaEditor (F4)" -ForegroundColor White
    Write-Host "  3. Navigate to Experts folder and open HedgeEdgeLicense.mq5" -ForegroundColor White
    Write-Host "  4. Press F7 to compile the EA" -ForegroundColor White
    Write-Host "  5. Go to Tools > Options > Expert Advisors" -ForegroundColor White
    Write-Host "     - Enable 'Allow DLL imports'" -ForegroundColor White
    Write-Host "     - Add 'https://api.hedge-edge.com' to WebRequest URLs" -ForegroundColor White
    Write-Host ""
    
    return $true
}

# ============================================================================
# Main
# ============================================================================

if ($Help) {
    Show-Help
    exit 0
}

Write-Host ""
Write-Host "  Hedge Edge MT5 DLL Build System" -ForegroundColor Cyan
Write-Host "  Version 1.0.0" -ForegroundColor Gray
Write-Host ""

# Build the DLL
$buildSuccess = Build-DLL

if (-not $buildSuccess) {
    exit 1
}

# Deploy if requested
if ($Deploy) {
    $deploySuccess = Deploy-ToMT5
    
    if (-not $deploySuccess) {
        exit 1
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Write-Host ""
