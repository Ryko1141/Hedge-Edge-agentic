# Hedge Edge Trading Platform Agents

This folder contains platform-specific agents for integrating trading platforms with the Hedge Edge desktop application. These agents handle license validation, account data streaming, and remote command execution.

## Platform Support

| Platform | Agent Type | License Validation | Data Streaming | Remote Commands |
|----------|------------|-------------------|----------------|-----------------|
| **MetaTrader 5** | EA + DLL | ✅ Native DLL | ✅ File-based JSON | ✅ File-based |
| **cTrader** | cBot (C#) | ✅ HTTPS | ✅ Named Pipes | ✅ Named Pipes |

## Structure

```
agents/
├── README.md                      # This file
├── mt5/
│   ├── README.md                  # MT5 installation guide
│   ├── HedgeEdgeLicense.mq5       # MQL5 Expert Advisor source
│   ├── HedgeEdgeLicense.ex5       # Compiled EA (after build)
│   ├── HedgeEdgeLicense.dll       # Native license DLL (x64)
│   ├── HedgeEdgeLicense.h         # DLL header
│   ├── HedgeEdgeLicense.cpp       # DLL source
│   └── HedgeEdgeLicense.def       # DLL exports
└── ctrader/
    ├── README.md                  # cTrader installation guide
    ├── HedgeEdgeLicense.cs        # cBot source code
    └── HedgeEdgeLicense.algo      # Compiled cBot (after build)
```

## Quick Start

### MetaTrader 5

1. Copy `HedgeEdgeLicense.dll` to `<MT5 Data>/MQL5/Libraries/`
2. Copy `HedgeEdgeLicense.mq5` to `<MT5 Data>/MQL5/Experts/`
3. Enable "Allow DLL imports" in MT5 Options → Expert Advisors
4. Compile the EA in MetaEditor
5. Attach EA to any chart and enter your license key

See [mt5/README.md](mt5/README.md) for detailed instructions.

### cTrader

1. Copy `HedgeEdgeLicense.cs` to cTrader's cBot Sources folder
2. Build in cTrader Automate
3. Attach to any chart and enter your license key

See [ctrader/README.md](ctrader/README.md) for detailed instructions.

## Features

### License Validation

Both agents validate Hedge Edge subscription licenses:
- **On startup**: Initial validation required before trading
- **Periodic**: Re-validates every 10-15 minutes (configurable)
- **Token caching**: Minimizes API calls with in-memory token cache
- **Fail closed**: Trading disabled if validation fails

### Data Streaming

Agents stream real-time account data to the Hedge Edge app:
- Account balance, equity, margin
- Floating P/L
- Open positions (symbol, volume, side, SL/TP, entry, profit)
- Status messages

### Remote Commands

The Hedge Edge app can send commands to agents:
- `PAUSE` - Pause trading operations
- `RESUME` - Resume trading
- `CLOSE_ALL` - Close all open positions immediately
- `CLOSE_POSITION` - Close a specific position
- `STATUS` - Query current agent status

## Data Format

Both agents emit JSON in a compatible format:

```json
{
  "timestamp": "2026-01-31T12:00:00.000Z",
  "platform": "MT5",
  "accountId": "12345678",
  "broker": "IC Markets",
  "balance": 10000.00,
  "equity": 10150.50,
  "margin": 500.00,
  "freeMargin": 9650.50,
  "floatingPnL": 150.50,
  "currency": "USD",
  "leverage": 500,
  "status": "Licensed - Active",
  "isLicenseValid": true,
  "isPaused": false,
  "positions": [...]
}
```

## Communication Channels

### MT5 (File-based)

| Channel | Path |
|---------|------|
| Data output | `MQL5/Files/HedgeEdgeMT5.json` |
| Command input | `MQL5/Files/HedgeEdgeMT5_cmd.json` |
| Response output | `MQL5/Files/HedgeEdgeMT5_resp.json` |

### cTrader (Named Pipes)

| Channel | Pipe Name |
|---------|-----------|
| Data output | `\\.\pipe\HedgeEdgeCTrader` |
| Command input/output | `\\.\pipe\HedgeEdgeCTrader_Commands` |

## Building from Source

### MT5 DLL

Requirements: Visual Studio 2019+, Windows SDK, C++17

```powershell
# In mt5 folder
mkdir build && cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
```

### cTrader cBot

Build directly in cTrader Automate:
1. Open Automate tab
2. Click Build button
3. Export as .algo if needed

## License API Endpoint

Both agents call the same Hedge Edge license API:

```
POST https://api.hedge-edge.com/v1/license/validate

Request:
{
  "licenseKey": "...",
  "accountId": "...",
  "broker": "...",
  "deviceId": "...",
  "platform": "MT5|cTrader",
  "version": "1.0.0"
}

Response (success):
{
  "valid": true,
  "token": "jwt-token",
  "ttlSeconds": 900,
  "plan": "monthly",
  "expiresAt": "2026-02-28T23:59:59Z"
}
```

## Security

- All API calls use TLS 1.2+
- Tokens are short-lived and cached in memory only
- No sensitive data written to disk
- Agents fail closed on validation errors

## Support

- Documentation: https://docs.hedge-edge.com/agents
- Support: support@hedge-edge.com

## Default Ports

| Platform | Port |
|----------|------|
| MT5      | 5101 |
| cTrader  | 5102 |
