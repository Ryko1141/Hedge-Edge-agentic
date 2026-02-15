# HedgEdge MT5 Expert Advisors

MetaTrader 5 Expert Advisors for the HedgEdge trade copier — a Master EA that publishes trades and a Slave EA that receives and mirrors them, both communicating over ZeroMQ.

## Folder Structure

```
agents/mt5/
├── HedgEdge property/          ← Distribution package (copy to end-user machines)
│   ├── Developer tools/        ← MQL5 source files & headers
│   │   ├── HedgEdge_Master.mq5
│   │   ├── HedgEdge_Slave.mq5
│   │   ├── ZMQv2.mqh
│   │   ├── ZMQ.mqh
│   │   └── Sodium.mqh
│   ├── Experts/                ← Compiled .ex5 EAs (gitignored — compile locally)
│   └── Libraries/              ← Runtime DLLs (gitignored — obtain from ZeroMQ releases)
├── license-dll/                ← C++ source for HedgeEdgeLicense.dll
│   ├── HedgeEdgeLicense.cpp
│   ├── HedgeEdgeLicense.h
│   ├── HedgeEdgeLicense.def
│   ├── CMakeLists.txt
│   └── build_dll.ps1
└── README.md
```

## Components

### Master EA (`HedgEdge_Master.mq5`)
- Runs on the **source** MT5 terminal (the account you want to copy FROM)
- Opens a ZeroMQ **PUB** socket (default port 51810) to broadcast trade events
- Opens a ZeroMQ **REP** socket (default port 51811) for command/status queries
- Validates the HedgEdge subscription license on startup and periodically

### Slave EA (`HedgEdge_Slave.mq5`)
- Runs on the **destination** MT5 terminal (the account you want to copy TO)
- Subscribes to the Master's PUB socket to receive trade signals
- Opens a ZeroMQ **REP** socket (default port 51821) for command/status queries
- Mirrors positions from the master with configurable lot scaling

### ZeroMQ Headers
- **ZMQv2.mqh** — Primary ZeroMQ wrapper (v2 API, used by both EAs)
- **ZMQ.mqh** — Legacy ZeroMQ wrapper (v1 compatibility)
- **Sodium.mqh** — libsodium bindings for encrypted transport

### License DLL (`license-dll/`)
- C++ source for `HedgeEdgeLicense.dll` — performs HTTPS license validation via WinHTTP
- Build with `build_dll.ps1` (requires MSVC / CMake) or compile via `CMakeLists.txt`
- The compiled DLL goes into the terminal's `MQL5/Libraries/` folder

## Installation

### Prerequisites

1. MetaTrader 5 terminal installed
2. Valid HedgEdge subscription with license key
3. HedgEdge desktop app installed

### Step 1: Install the DLLs

Copy the following into each MT5 terminal's `MQL5/Libraries/` folder
(or into `HedgEdge property/Libraries/` for distribution):

- `libzmq.dll` — ZeroMQ runtime (obtain from [zeromq releases](https://github.com/zeromq/libzmq/releases))
- `libsodium.dll` — libsodium runtime
- `HedgeEdgeLicense.dll` — built from `license-dll/`

### Step 2: Install the EAs

Copy the compiled `.ex5` files into each terminal's `MQL5/Experts/` folder:

- `HedgEdge_Master.ex5` → Master terminal
- `HedgEdge_Slave.ex5` → Slave terminal(s)

**To compile from source:**
1. Open MetaEditor (F4 from MT5)
2. Copy the `.mqh` headers to `MQL5/Include/` and the `.mq5` source to `MQL5/Experts/`
3. Open the `.mq5` file and press **Compile** (F7)

### Step 3: Configure MT5 Settings

**CRITICAL — these must be enabled:**

1. **Tools → Options → Expert Advisors:**
   - ✅ Allow algorithmic trading
   - ✅ Allow DLL imports
2. **Enable AutoTrading** (green button in toolbar)

### Step 4: Attach EAs to Charts

1. Attach **HedgEdge_Master** to a chart on the source account
2. Attach **HedgEdge_Slave** to a chart on each destination account
3. Enter your license key and configure ports in the EA parameters

## ZeroMQ Communication

| Socket | Master | Slave |
|--------|--------|-------|
| PUB (trade broadcast) | port 51810 | — (subscribes to master) |
| REP (command/status) | port 51811 | port 51821 |

The HedgEdge desktop app connects to both EAs via ZeroMQ to orchestrate trade copying.

## Building the License DLL

```powershell
cd agents/mt5/license-dll

# Quick build (requires MSVC)
.\build_dll.ps1

# Or via CMake
mkdir build; cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
```

**Requirements:** Visual Studio 2019+ with C++ Desktop Development, CMake 3.15+

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "DLL import not allowed" | Enable **Allow DLL imports** in Tools → Options → Expert Advisors |
| EA stays at "Initializing" | Check Experts tab for errors; verify DLLs are in `MQL5/Libraries/` |
| Slave not detected by app | Confirm slave registration file exists in `%APPDATA%\MetaQuotes\Terminal\Common\Files\HedgeEdge\` |
| DLL not loading | Ensure x64 DLL with x64 MT5; install Visual C++ Redistributable |

## Security Notes

- **DLL Trust**: Only install DLLs from trusted sources — they have full system access
- **License Key**: Keep private; never share
- **Network**: All license API calls use TLS 1.2+
