# Hedge Edge MT4 Agent

## Status: ✅ Ready for Testing

MetaTrader 4 Expert Advisor for Hedge Edge license validation and account data streaming.

## Overview

The MT4 agent follows the same architecture as the MT5 version:
- **MQL4 Expert Advisor** (`HedgeEdgeLicense.mq4`) - Main EA that runs on MT4 charts
- **32-bit Native DLL** (`HedgeEdgeLicense32.dll`) - Handles HTTPS license validation
- **File-based IPC** - Streams account data to desktop app via JSON files

## Key Differences from MT5

| Feature | MT4 | MT5 |
|---------|-----|-----|
| Architecture | 32-bit (x86) | 64-bit (x64) |
| Language | MQL4 | MQL5 |
| Position System | Order-based (`OrderSelect`, `OrderClose`) | Position-based (`PositionSelect`, `PositionGetDouble`) |
| Account Functions | `AccountBalance()`, `AccountEquity()` | `AccountInfoDouble(ACCOUNT_BALANCE)` |
| Object Functions | `ObjectSet()`, `ObjectSetText()` | `ObjectSetInteger()`, `ObjectSetString()` |

## Files

| File | Description |
|------|-------------|
| `HedgeEdgeLicense.mq4` | Main Expert Advisor source code |
| `HedgeEdgeLicense32.cpp` | 32-bit DLL source code |
| `HedgeEdgeLicense32.h` | DLL header file |
| `HedgeEdgeLicense32.def` | Module definition for exports |

## Building the DLL

### Prerequisites

- Visual Studio 2022 (Community or higher)
- Windows SDK
- **32-bit (x86) build tools** - MT4 only supports 32-bit DLLs

### Build Commands

Open **x86 Native Tools Command Prompt for VS 2022** and run:

```batch
cd agents\mt4

:: Set up 32-bit build environment (if not already in x86 command prompt)
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars32.bat"

:: Compile the DLL
cl.exe /LD /O2 /MT /EHsc /DUNICODE /D_UNICODE /DHEDGEEDGE_EXPORTS HedgeEdgeLicense32.cpp /link /DEF:HedgeEdgeLicense32.def /OUT:HedgeEdgeLicense32.dll winhttp.lib
```

This produces:
- `HedgeEdgeLicense32.dll` - The 32-bit DLL
- `HedgeEdgeLicense32.lib` - Import library
- `HedgeEdgeLicense32.exp` - Export file

### Verify Build

Confirm the DLL is 32-bit:

```batch
dumpbin /headers HedgeEdgeLicense32.dll | findstr "machine"
```

Output should show: `14C machine (x86)` (not `8664` which is x64)

## Installation

### 1. Copy DLL to MT4

Copy `HedgeEdgeLicense32.dll` to your MT4 installation:

```
MT4_INSTALL_PATH\MQL4\Libraries\HedgeEdgeLicense32.dll
```

Common paths:
- `C:\Program Files (x86)\MetaTrader 4\MQL4\Libraries\`
- `C:\Users\<username>\AppData\Roaming\MetaQuotes\Terminal\<ID>\MQL4\Libraries\`

### 2. Copy EA to MT4

Copy `HedgeEdgeLicense.mq4` to:

```
MT4_INSTALL_PATH\MQL4\Experts\HedgeEdgeLicense.mq4
```

### 3. Compile in MetaEditor

1. Open MetaEditor (F4 from MT4)
2. Navigate to **Experts** folder
3. Open `HedgeEdgeLicense.mq4`
4. Press **F7** (Compile)
5. Verify no errors in the **Errors** tab

### 4. Enable DLL Imports

In MT4:
1. Go to **Tools > Options > Expert Advisors**
2. Check **"Allow DLL imports"**
3. Click **OK**

### 5. Attach EA to Chart

1. Drag `HedgeEdgeLicense` from Navigator to any chart
2. In the EA settings dialog:
   - Enter your **License Key**
   - Optionally set **Device ID** (auto-generated if empty)
   - Configure other settings as needed
3. Check **"Allow DLL imports"** in the **Common** tab
4. Click **OK**

## Configuration

### Input Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `InpLicenseKey` | (required) | Your Hedge Edge license key |
| `InpDeviceId` | (auto) | Device identifier for license binding |
| `InpEndpointUrl` | `https://api.hedge-edge.com/v1/license/validate` | License API endpoint |
| `InpPollIntervalSeconds` | `600` | License revalidation interval (seconds) |
| `InpStatusChannel` | `HedgeEdgeMT4` | Channel name for data streaming |
| `InpDataEmitInterval` | `1` | Data emit frequency (seconds) |
| `InpEnableCommands` | `true` | Enable remote commands from desktop app |
| `InpActiveColor` | `clrLime` | Chart label color when active |
| `InpPausedColor` | `clrOrange` | Chart label color when paused |
| `InpErrorColor` | `clrRed` | Chart label color on error |

## File-Based IPC

The EA communicates with the desktop app via JSON files in the MT4 Files folder:

| File | Direction | Purpose |
|------|-----------|---------|
| `HedgeEdgeMT4.json` | EA → App | Account data stream |
| `HedgeEdgeMT4_cmd.json` | App → EA | Commands (PAUSE, RESUME, CLOSE_ALL, etc.) |
| `HedgeEdgeMT4_resp.json` | EA → App | Command responses |

### Data Channel Format

```json
{
  "timestamp": "2026.02.01 12:00:00",
  "platform": "MT4",
  "accountId": "12345678",
  "broker": "Demo Broker",
  "server": "Demo-Server",
  "balance": 10000.00,
  "equity": 10250.50,
  "margin": 500.00,
  "freeMargin": 9750.50,
  "marginLevel": 2050.10,
  "floatingPnL": 250.50,
  "currency": "USD",
  "leverage": 100,
  "status": "Licensed - Active",
  "isLicenseValid": true,
  "isPaused": false,
  "lastError": null,
  "positions": [
    {
      "id": "123456",
      "symbol": "EURUSD",
      "volume": 0.10,
      "volumeLots": 0.10,
      "side": "BUY",
      "entryPrice": 1.08500,
      "currentPrice": 1.08750,
      "stopLoss": 1.08000,
      "takeProfit": 1.09500,
      "profit": 25.00,
      "swap": -1.50,
      "commission": -0.70,
      "openTime": "2026.02.01 10:30:00",
      "comment": "",
      "magicNumber": 0
    }
  ]
}
```

### Command Format

```json
{
  "action": "PAUSE"
}
```

Available actions:
- `PAUSE` - Pause trading operations
- `RESUME` - Resume trading operations
- `CLOSE_ALL` - Close all open positions
- `CLOSE_POSITION` - Close specific position (requires `positionId`)
- `STATUS` - Get current status

## Troubleshooting

### DLL Loading Errors

**"Cannot load 'HedgeEdgeLicense32.dll'"**
1. Verify DLL is in `MQL4\Libraries\` folder
2. Ensure DLL is 32-bit (not 64-bit)
3. Check Windows Visual C++ Redistributable is installed

**"DLL imports are not allowed"**
1. Go to **Tools > Options > Expert Advisors**
2. Enable **"Allow DLL imports"**

### License Validation Fails

**"Network error"**
1. Check internet connection
2. Allow MT4 through firewall
3. Verify API endpoint is reachable

**"License invalid"**
1. Verify license key is correct
2. Check license hasn't expired
3. Ensure account is authorized

### No Data in Desktop App

1. Verify EA is running (check chart comment)
2. Check `MQL4\Files\` folder for JSON files
3. Ensure desktop app is configured for MT4 channel

## Testing

### Test 1: DLL Loading
1. Attach EA to chart
2. Check **Journal** tab for "HedgeEdgeLicense32.dll loaded successfully"
3. Verify no DLL errors

### Test 2: License Validation
1. Enter valid license key
2. Check chart shows "Licensed - Active" in green
3. Verify Journal shows "License validated successfully"

### Test 3: Position Tracking
1. Open a trade manually
2. Check the JSON data file for position data
3. Verify position appears in desktop app

### Test 4: Commands
1. Send PAUSE command from desktop app
2. Verify chart shows "Licensed - Paused" in orange
3. Send RESUME command
4. Verify chart returns to "Licensed - Active"

## Acceptance Criteria

- [x] EA compiles without errors in MetaEditor 4
- [x] 32-bit DLL loads successfully in MT4
- [x] License validation works via HTTPS
- [x] Position tracking captures all open orders
- [x] Data streams to desktop app via file channel
- [x] Commands work (PAUSE/RESUME/CLOSE_ALL/STATUS)
- [x] Error handling displays appropriate messages

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-01 | Initial release - ported from MT5 |
