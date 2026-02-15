# Hedge Edge MT5 Expert Advisor v2.0

A MetaTrader 5 Expert Advisor that validates Hedge Edge monthly subscription licenses and streams live account data to the Hedge Edge desktop application using high-performance ZeroMQ messaging.

## Architecture Overview

### v2.0 - ZeroMQ High-Performance Mode

```
┌─────────────────────┐         ZeroMQ          ┌──────────────────────┐
│   MT5 Terminal      │  ←─────────────────────→│  Hedge Edge App      │
│                     │                          │                      │
│  ┌───────────────┐  │  tcp://127.0.0.1:51810  │  ┌────────────────┐  │
│  │ HedgeEdge EA  │──┼──────── PUB/SUB ────────┼──│  ZMQ Bridge    │  │
│  │  (Publisher)  │  │    (Account Snapshots)  │  │  (Subscriber)  │  │
│  └───────────────┘  │                          │  └────────────────┘  │
│         │           │  tcp://127.0.0.1:51811  │         │            │
│         └───────────┼──────── REQ/REP ────────┼─────────┘            │
│                     │      (Commands)          │                      │
└─────────────────────┘                          └──────────────────────┘
```

### Key Benefits over File-Based IPC

| Metric | File-Based | ZeroMQ |
|--------|-----------|--------|
| Latency | 50-100ms (polling) | < 1ms |
| Throughput | ~10 snapshots/sec | 1000+ snapshots/sec |
| Reliability | File locking issues | Guaranteed delivery |
| CPU Usage | High (polling) | Low (event-driven) |
| Bi-directional | Limited | Full duplex |

## Components

| File | Description |
|------|-------------|
| `HedgeEdgeLicenseZMQ.mq5` | MQL5 EA with ZeroMQ support (v2.0) |
| `HedgeEdgeLicense.mq5` | Legacy MQL5 EA (file-based, v1.0) |
| `ZMQ.mqh` | ZeroMQ wrapper/imports for MQL5 |
| `Sodium.mqh` | libsodium crypto wrapper for MQL5 |
| `HedgeEdgeLicense.dll` | Legacy DLL (for fallback mode) |

## Required DLLs

### ZeroMQ Mode (Recommended)

The following DLLs must be placed in your MT5 `Libraries` folder:

| DLL | Version | Source |
|-----|---------|--------|
| `libzmq.dll` | 4.3.4+ (x64) | [ZeroMQ Releases](https://github.com/zeromq/libzmq/releases) |
| `libsodium.dll` | 1.0.18+ (x64) | [libsodium Releases](https://download.libsodium.org/libsodium/releases/) |

**Optional (if not using static VC++ linking):**
- `MSVCP140.dll`
- `VCRUNTIME140.dll`

### Download Pre-built DLLs

1. **libzmq.dll**:
   - Go to: https://github.com/zeromq/libzmq/releases
   - Download: `zeromq-4.3.4-win-x64.zip` (or latest)
   - Extract: `bin/libzmq.dll`

2. **libsodium.dll**:
   - Go to: https://download.libsodium.org/libsodium/releases/
   - Download: `libsodium-1.0.18-msvc.zip` (or latest)
   - Extract: `x64/Release/v142/dynamic/libsodium.dll`

## Installation

### Step 1: Install DLLs

1. **Locate MT5 Libraries folder**:
   - Open MT5
   - Go to **File** → **Open Data Folder**
   - Navigate to `MQL5/Libraries/`

2. **Copy DLLs**:
   ```
   MQL5/Libraries/
   ├── libzmq.dll
   ├── libsodium.dll
   └── HedgeEdgeLicense.dll (optional, for fallback)
   ```

### Step 2: Install Include Files

1. **Copy header files**:
   ```
   MQL5/Include/
   ├── ZMQ.mqh
   └── Sodium.mqh
   ```
   
   Or place them alongside the EA:
   ```
   MQL5/Experts/
   ├── HedgeEdgeLicenseZMQ.mq5
   ├── ZMQ.mqh
   └── Sodium.mqh
   ```

### Step 3: Install the EA

1. **Copy EA to Experts folder**:
   ```
   MQL5/Experts/HedgeEdgeLicenseZMQ.mq5
   ```

2. **Compile in MetaEditor** (F4 then F7):
   - Open MetaEditor
   - File → Open → `HedgeEdgeLicenseZMQ.mq5`
   - Press F7 to compile
   - Verify: "0 errors, 0 warnings"

### Step 4: Configure MT5 Settings

**⚠️ CRITICAL: These settings must be enabled!**

1. **Enable Algorithmic Trading**:
   - Go to **Tools** → **Options** → **Expert Advisors**
   - ✅ Check "Allow algorithmic trading"
   - ✅ Check "Allow DLL imports" *(Required for ZMQ and Sodium)*

2. **Add WebRequest URL** (for license validation):
   - In the same dialog, add to "Allow WebRequest for listed URL":
   ```
   https://api.hedge-edge.com
   ```

3. **Enable AutoTrading**:
   - Click the "AutoTrading" button in the toolbar (should be green)

### Step 5: Attach EA to Chart

1. Open any chart (symbol doesn't matter for license EA)
2. In Navigator (Ctrl+N), find "Expert Advisors" → "HedgeEdgeLicenseZMQ"
3. Drag the EA onto the chart
4. Configure parameters (see below)
5. Check "Allow DLL imports" in the dialog
6. Click OK

## Configuration Parameters

### License Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| **License Key** | *(required)* | Your Hedge Edge subscription license key |
| **Device ID** | Auto-generated | Unique device identifier (from app or auto) |
| **API Endpoint** | `https://api.hedge-edge.com/v1/license/validate` | License API URL |
| **License Check Interval** | 600 | Revalidation interval (seconds) |

### ZeroMQ Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Use ZMQ** | true | Enable ZeroMQ mode (vs file fallback) |
| **Data Port** | 51810 | Port for PUB socket (account snapshots) |
| **Command Port** | 51811 | Port for REP socket (commands) |
| **Publish Interval (ms)** | 250 | Snapshot publish frequency |
| **Bind Address** | 127.0.0.1 | ZMQ socket bind address |

### Security Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| **App Secret** | *(optional)* | Shared secret for encrypted license validation |

### Fallback Settings (File Mode)

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Status Channel** | HedgeEdgeMT5 | File name for status JSON |
| **File Emit Interval** | 1 | Emit interval in seconds (file mode) |

## Data Format

### Account Snapshot (ZMQ PUB → SUB)

Published every `publishIntervalMs` milliseconds:

```json
{
  "type": "SNAPSHOT",
  "timestamp": "2026.02.01 10:30:45",
  "platform": "MT5",
  "accountId": "12345678",
  "broker": "Your Broker Name",
  "server": "YourBroker-Live",
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
  "zmqMode": true,
  "snapshotIndex": 12345,
  "avgLatencyUs": 150,
  "positions": [
    {
      "id": "123456789",
      "symbol": "EURUSD",
      "volume": 1.00,
      "volumeLots": 1.00,
      "side": "BUY",
      "entryPrice": 1.08500,
      "currentPrice": 1.08750,
      "stopLoss": 1.08000,
      "takeProfit": 1.09500,
      "profit": 250.00,
      "swap": -1.50,
      "commission": -7.00,
      "openTime": "2026.02.01 08:15:30",
      "comment": ""
    }
  ]
}
```

### Commands (ZMQ REQ → REP)

#### PAUSE
```json
// Request
{"action": "PAUSE"}

// Response
{"success": true, "status": "paused"}
```

#### RESUME
```json
// Request
{"action": "RESUME"}

// Response
{"success": true, "status": "running"}
// or
{"success": false, "error": "License invalid"}
```

#### CLOSE_ALL
```json
// Request
{"action": "CLOSE_ALL"}

// Response
{"success": true, "closedCount": 5}
// or
{"success": true, "closedCount": 3, "errors": "123:4756, 456:4758"}
```

#### CLOSE_POSITION
```json
// Request
{"action": "CLOSE_POSITION", "positionId": "123456789"}

// Response
{"success": true}
// or
{"success": false, "error": "Close failed: 4756"}
```

#### STATUS
```json
// Request
{"action": "STATUS"}

// Response (full snapshot)
{"type": "SNAPSHOT", ...}
```

#### PING
```json
// Request
{"action": "PING"}

// Response
{"success": true, "pong": true, "timestamp": 1706789445}
```

#### CONFIG
```json
// Request
{"action": "CONFIG"}

// Response
{
  "success": true,
  "config": {
    "zmqEnabled": true,
    "dataPort": 51810,
    "commandPort": 51811,
    "publishIntervalMs": 250,
    "licenseCheckIntervalSec": 600
  }
}
```

## Encrypted License Validation

When `App Secret` is provided, license validation uses encrypted payloads via libsodium:

1. EA generates payload with license key, account info, and nonce
2. Payload is encrypted using XSalsa20-Poly1305 (crypto_secretbox)
3. Encrypted blob is sent to license API
4. API decrypts, validates, and returns encrypted response
5. EA decrypts response to get validation result

This ensures license keys never appear in plaintext in network traffic.

## Troubleshooting

### EA Won't Load

1. **"DLL imports not allowed"**:
   - Enable "Allow DLL imports" in EA settings
   - Enable "Allow DLL imports" in Tools → Options → Expert Advisors

2. **"Cannot load library 'libzmq.dll'"**:
   - Verify DLL is in `MQL5/Libraries/`
   - Ensure you downloaded the **x64** version
   - Install VC++ Redistributable if needed

3. **"WebRequest failed"**:
   - Add `https://api.hedge-edge.com` to allowed URLs
   - Check internet connection and firewall

### ZMQ Connection Issues

1. **"Failed to bind"**:
   - Port already in use (another EA instance?)
   - Change `Data Port` and `Command Port` to unique values
   - Each EA instance needs unique ports

2. **No data in app**:
   - Check firewall allows localhost connections
   - Verify ports match between EA and app config
   - Use PING command to test connectivity

### License Validation Fails

1. **"License expired/invalid"**:
   - Check subscription status at hedge-edge.com
   - Verify license key is entered correctly
   - Check device ID hasn't changed

2. **"Decryption failed"**:
   - Ensure App Secret matches between EA and license API
   - App Secret is case-sensitive

## Performance Tuning

### For Maximum Performance

```
Use ZMQ = true
Publish Interval (ms) = 100
```

### For Lower Resource Usage

```
Use ZMQ = true
Publish Interval (ms) = 500
```

### For Compatibility Mode (No ZMQ)

```
Use ZMQ = false
File Emit Interval = 1
```

## Multiple Accounts

Each MT5 terminal running the EA must use different ports:

| Terminal | Data Port | Command Port |
|----------|-----------|--------------|
| Account 1 | 51810 | 51811 |
| Account 2 | 51812 | 51813 |
| Account 3 | 51814 | 51815 |

Configure matching ports in the Hedge Edge app connection settings.

## Version History

### v2.0 (February 2026)
- Added ZeroMQ high-performance messaging
- Added libsodium encrypted license validation
- Sub-millisecond latency for real-time data
- Bi-directional command/response pattern
- File-based fallback for compatibility

### v1.0 (January 2026)
- Initial release
- File-based IPC
- DLL-based license validation
- Named pipe support

## Support

- Documentation: https://docs.hedge-edge.com/mt5-ea
- Support Email: support@hedge-edge.com
- GitHub Issues: https://github.com/hedgeedge/mt5-ea/issues

## License

Copyright © 2026 Hedge Edge. All rights reserved.
This software is licensed to valid Hedge Edge subscribers only.
