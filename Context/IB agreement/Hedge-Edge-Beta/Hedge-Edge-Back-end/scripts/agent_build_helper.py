"""
Hedge Edge Agent Compilation Helper

This script helps with building/compiling the MT5 and cTrader agents.
It provides paths and instructions for manual compilation.

Usage:
    python agent_build_helper.py [--mt5] [--ctrader] [--all]
"""

import os
import sys
import subprocess
from pathlib import Path
import winreg
import json

# Paths
WORKSPACE_DIR = Path(__file__).parent.parent
AGENTS_DIR = WORKSPACE_DIR / "agents"
MT5_DIR = AGENTS_DIR / "mt5"
CTRADER_DIR = AGENTS_DIR / "ctrader"


def find_mt5_installation():
    """Find MetaTrader 5 installation path"""
    common_paths = [
        Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / "MetaTrader 5",
        Path(os.environ.get('PROGRAMFILES(X86)', 'C:/Program Files (x86)')) / "MetaTrader 5",
        Path(os.environ.get('LOCALAPPDATA', '')) / "Programs" / "MetaTrader 5",
    ]
    
    # Check common paths
    for path in common_paths:
        if path.exists():
            metaeditor = path / "metaeditor64.exe"
            if metaeditor.exists():
                return path
    
    # Try to find from registry
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\MetaQuotes\MetaTrader 5") as key:
            install_path = winreg.QueryValueEx(key, "InstallPath")[0]
            return Path(install_path)
    except:
        pass
    
    return None


def find_mt5_data_folder():
    """Find MT5 data folder (MQL5 location)"""
    appdata = Path(os.environ.get('APPDATA', ''))
    
    # Check for MetaQuotes folder
    mq_folder = appdata / "MetaQuotes" / "Terminal"
    if mq_folder.exists():
        # Find the terminal folder (usually has a long hex name)
        for folder in mq_folder.iterdir():
            if folder.is_dir() and len(folder.name) == 32:
                mql5_folder = folder / "MQL5"
                if mql5_folder.exists():
                    return folder
    
    return None


def compile_mt5_dll():
    """Provide instructions for compiling MT5 DLL"""
    print("\n" + "=" * 60)
    print("MT5 DLL Compilation Instructions")
    print("=" * 60)
    
    dll_source = MT5_DIR / "HedgeEdgeLicense.cpp"
    dll_header = MT5_DIR / "HedgeEdgeLicense.h"
    dll_def = MT5_DIR / "HedgeEdgeLicense.def"
    
    print(f"""
Source Files:
  - {dll_source}
  - {dll_header}
  - {dll_def}

Requirements:
  - Visual Studio 2019 or later (with C++ desktop development)
  - Windows SDK

Build Steps:
  1. Open Visual Studio
  2. Create new "Dynamic-Link Library (DLL)" project
  3. Add the source files to the project
  4. Project Properties:
     - Configuration: Release
     - Platform: x64
     - Calling Convention: __stdcall
     - Additional Dependencies: winhttp.lib
  5. Build the solution
  6. Copy output DLL to MT5 Libraries folder

Command Line Build (Developer Command Prompt):
  cd "{MT5_DIR}"
  cl /LD /EHsc /O2 /DHEDGEEDGE_EXPORTS HedgeEdgeLicense.cpp /link winhttp.lib /DEF:HedgeEdgeLicense.def /OUT:HedgeEdgeLicense.dll
""")


def compile_mt5_ea():
    """Compile MT5 EA using MetaEditor"""
    print("\n" + "=" * 60)
    print("MT5 Expert Advisor Compilation")
    print("=" * 60)
    
    mt5_path = find_mt5_installation()
    mt5_data = find_mt5_data_folder()
    
    ea_source = MT5_DIR / "HedgeEdgeLicense.mq5"
    
    if mt5_path:
        print(f"MT5 Installation found: {mt5_path}")
        metaeditor = mt5_path / "metaeditor64.exe"
        
        if mt5_data:
            print(f"MT5 Data folder found: {mt5_data}")
            
            # Copy EA source to MT5 folder
            mql5_experts = mt5_data / "MQL5" / "Experts"
            mql5_libs = mt5_data / "MQL5" / "Libraries"
            
            print(f"""
Source File: {ea_source}

Installation:
  1. Copy EA source to: {mql5_experts / 'HedgeEdgeLicense.mq5'}
  2. Copy DLL to: {mql5_libs / 'HedgeEdgeLicense.dll'}

Automatic Compilation Command:
  "{metaeditor}" /compile:"{ea_source}" /log

Manual Compilation:
  1. Open MetaTrader 5
  2. Press F4 to open MetaEditor
  3. Open {ea_source}
  4. Press F7 to compile
  5. Check for errors in the output panel
""")
    else:
        print("MT5 installation not found!")
        print(f"""
Manual Steps:
  1. Install MetaTrader 5
  2. Open MetaEditor (F4 from MT5)
  3. Copy {ea_source} to your MQL5/Experts folder
  4. Open and compile (F7)
""")


def compile_ctrader_cbot():
    """Provide instructions for cTrader cBot"""
    print("\n" + "=" * 60)
    print("cTrader cBot Compilation")
    print("=" * 60)
    
    cbot_source = CTRADER_DIR / "HedgeEdgeLicense.cs"
    
    # Find cTrader installation
    documents = Path(os.environ.get('USERPROFILE', '')) / "Documents"
    ctrader_sources = documents / "cTrader Automate" / "Sources" / "Robots"
    
    if ctrader_sources.exists():
        print(f"cTrader Sources folder found: {ctrader_sources}")
    
    print(f"""
Source File: {cbot_source}

Installation:
  1. Copy the cBot source to: {ctrader_sources}
     Or: Documents/cTrader Automate/Sources/Robots/
  
  2. Open cTrader desktop application
  
  3. Go to 'Automate' tab
  
  4. Click 'Build' to compile all cBots
  
  5. Find 'HedgeEdgeLicense' under cBots
  
  6. Drag onto any chart to run

Note: cTrader compiles C# automatically when you click Build.
No external tools required.
""")


def install_agents():
    """Install agents to the correct locations"""
    print("\n" + "=" * 60)
    print("Installing Agents")
    print("=" * 60)
    
    # MT5
    mt5_data = find_mt5_data_folder()
    if mt5_data:
        mql5_experts = mt5_data / "MQL5" / "Experts"
        mql5_libs = mt5_data / "MQL5" / "Libraries"
        
        # Copy EA
        ea_src = MT5_DIR / "HedgeEdgeLicense.mq5"
        ea_dst = mql5_experts / "HedgeEdgeLicense.mq5"
        
        if ea_src.exists():
            import shutil
            mql5_experts.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ea_src, ea_dst)
            print(f"✓ Copied EA to: {ea_dst}")
        
        # Note: DLL needs to be compiled first
        dll_dst = mql5_libs / "HedgeEdgeLicense.dll"
        print(f"✗ DLL needs to be compiled and copied to: {dll_dst}")
    else:
        print("MT5 data folder not found - manual installation required")
    
    # cTrader
    documents = Path(os.environ.get('USERPROFILE', '')) / "Documents"
    ctrader_sources = documents / "cTrader Automate" / "Sources" / "Robots"
    
    cbot_src = CTRADER_DIR / "HedgeEdgeLicense.cs"
    if ctrader_sources.exists() and cbot_src.exists():
        import shutil
        cbot_dst = ctrader_sources / "HedgeEdgeLicense.cs"
        shutil.copy2(cbot_src, cbot_dst)
        print(f"✓ Copied cBot to: {cbot_dst}")
    else:
        print("cTrader sources folder not found - manual installation required")


def main():
    print("=" * 60)
    print("Hedge Edge Agent Build Helper")
    print("=" * 60)
    
    # Parse arguments
    mt5_only = '--mt5' in sys.argv
    ctrader_only = '--ctrader' in sys.argv
    install = '--install' in sys.argv
    run_all = '--all' in sys.argv or (not mt5_only and not ctrader_only)
    
    # Check installations
    mt5_path = find_mt5_installation()
    mt5_data = find_mt5_data_folder()
    
    print(f"\nMT5 Installation: {'Found at ' + str(mt5_path) if mt5_path else 'Not found'}")
    print(f"MT5 Data Folder: {'Found at ' + str(mt5_data) if mt5_data else 'Not found'}")
    
    if install:
        install_agents()
        return
    
    if run_all or mt5_only:
        compile_mt5_dll()
        compile_mt5_ea()
    
    if run_all or ctrader_only:
        compile_ctrader_cbot()
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print("""
Agent files are ready in:
  - MT5 EA:   agents/mt5/HedgeEdgeLicense.mq5
  - MT5 DLL:  agents/mt5/HedgeEdgeLicense.cpp (needs compilation)
  - cTrader:  agents/ctrader/HedgeEdgeLicense.cs

To install agents automatically:
  python agent_build_helper.py --install
""")


if __name__ == '__main__':
    main()
