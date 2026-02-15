# Hedge Edge cTrader cBot

A cTrader cBot that validates Hedge Edge monthly subscription licenses and streams live account data to the Hedge Edge desktop application.

**Status:** ✅ Production Ready  
**Version:** 1.0.0  
**Last Updated:** 2026-02-01

> 📖 **For detailed step-by-step installation instructions, see [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)**  
> 📋 **For testing procedures, see [TEST_RESULTS_TEMPLATE.md](TEST_RESULTS_TEMPLATE.md)**

## Features

- **License Validation**: Validates your Hedge Edge subscription on startup and every 10-15 minutes
- **Token Caching**: Caches authentication tokens in memory with automatic refresh before expiry
- **License Gating**: Automatically disables trading when license is invalid/expired
- **Live Data Streaming**: Streams account balance, equity, positions, and performance to the Hedge Edge app
- **Remote Commands**: Accepts pause/resume/close-all commands from the Hedge Edge app
- **Network Resilience**: Automatic reconnection with exponential backoff on network errors

## Installation

### Prerequisites

1. cTrader desktop application installed
2. Valid Hedge Edge subscription with license key
3. Hedge Edge desktop app installed

### Steps

1. **Locate cTrader Algo folder**:
   - Open cTrader
   - Go to **Automate** tab
   - Right-click on "cBots" and select "Open in File Explorer"
   - Navigate to the `Sources` folder

2. **Copy the cBot file**:
   - Copy `HedgeEdgeLicense.cs` to the cBots Sources folder
   - The path is typically: `Documents/cTrader Automate/Sources/Robots/`

3. **Build the cBot**:
   - In cTrader Automate, click "Build" button
   - Wait for compilation to complete (should show green checkmark)

4. **Attach to Chart**:
   - Open a chart for any symbol
   - In Automate tab, find "HedgeEdgeLicense" under cBots
   - Double-click or drag onto the chart

## Configuration

### Required Parameters

| Parameter | Description |
|-----------|-------------|
| **License Key** | Your Hedge Edge subscription license key (required) |

### Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Device ID** | Auto-generated | Unique device identifier (provided by Hedge Edge app) |
| **API Endpoint** | `https://api.hedge-edge.com/v1/license/validate` | License validation API URL |
| **Poll Interval (seconds)** | 600 | How often to revalidate license (60-3600) |
| **Status Channel** | `HedgeEdgeCTrader` | Named pipe for communication with app |
| **Enable Commands** | true | Whether to accept commands from app |
| **Data Emit Interval (seconds)** | 1 | How often to send account data (1-60) |

### Setting the License Key

1. After attaching cBot to chart, the parameters dialog appears
2. Enter your license key in the "License Key" field
3. Click "OK" to start

## Required Permissions

The cBot requires **Full Access** permissions to:
- Make HTTPS requests to the license API
- Create named pipes for IPC with Hedge Edge app
- Access account information and positions

When prompted, allow these permissions for the cBot to function properly.

## Status Channel Format

The cBot streams JSON data over a named pipe. Default pipe name: `HedgeEdgeCTrader`

### Account Snapshot (sent every 1 second by default)

```json
{
  "timestamp": "2026-01-31T12:00:00.000Z",
  "platform": "cTrader",
  "accountId": "12345678",
  "broker": "IC Markets",
  "balance": 10000.00,
  "equity": 10150.50,
  "margin": 500.00,
  "freeMargin": 9650.50,
  "marginLevel": 2030.10,
  "floatingPnL": 150.50,
  "currency": "USD",
  "leverage": 500,
  "status": "Licensed - Active",
  "isLicenseValid": true,
  "isPaused": false,
  "lastError": null,
  "positions": [
    {
      "id": "123456",
      "symbol": "EURUSD",
      "volume": 100000,
      "volumeLots": 1.0,
      "side": "BUY",
      "entryPrice": 1.08500,
      "currentPrice": 1.08650,
      "stopLoss": 1.08000,
      "takeProfit": 1.09000,
      "profit": 150.00,
      "pips": 15.0,
      "swap": -2.50,
      "commission": -7.00,
      "openTime": "2026-01-31T10:00:00.000Z",
      "comment": "",
      "label": ""
    }
  ]
}
```

### Command Channel

Commands are sent on pipe: `HedgeEdgeCTrader_Commands`

#### Available Commands

| Command | Description | Request | Response |
|---------|-------------|---------|----------|
| PAUSE | Pause trading | `{"action":"PAUSE"}` | `{"success":true,"message":"Trading paused"}` |
| RESUME | Resume trading | `{"action":"RESUME"}` | `{"success":true,"message":"Trading resumed"}` |
| CLOSE_ALL | Close all positions | `{"action":"CLOSE_ALL"}` | `{"success":true,"closedCount":3,"errors":[]}` |
| CLOSE_POSITION | Close specific position | `{"action":"CLOSE_POSITION","positionId":"123"}` | `{"success":true}` |
| STATUS | Get current status | `{"action":"STATUS"}` | Status object |

## Visual Indicators

The cBot displays status on the chart:

| Status | Color | Meaning |
|--------|-------|---------|
| Licensed - Active | 🟢 Green | License valid, trading enabled |
| Licensed - Paused | 🟠 Orange | License valid, trading paused by app |
| License Invalid | 🔴 Red | License expired or invalid |
| License check failed | 🔴 Red | Network error after max retries |

## Troubleshooting

### License validation fails
- Verify your license key is correct
- Check internet connectivity
- Ensure cTrader has network access permissions
- Check if license has expired in Hedge Edge dashboard

### Pipe connection issues
- Ensure Hedge Edge app is running
- Check that the Status Channel name matches in both cBot and app
- On Windows, try running cTrader as Administrator

### No data received in app
- Verify cBot is attached and running (green status)
- Check Data Emit Interval setting
- Look for errors in cTrader Automate log

### Commands not working
- Ensure "Enable Commands" is set to true
- Verify command pipe name matches: `{StatusChannel}_Commands`
- Check command JSON format

## License API

The cBot calls the Hedge Edge license API with:

```json
POST /v1/license/validate
{
  "licenseKey": "your-license-key",
  "accountId": "12345678",
  "broker": "IC Markets",
  "deviceId": "generated-device-id",
  "platform": "cTrader",
  "version": "1.0.0"
}
```

Expected response:
```json
{
  "valid": true,
  "token": "signed-jwt-token",
  "ttlSeconds": 900,
  "message": "License active",
  "plan": "monthly",
  "expiresAt": "2026-02-28T23:59:59Z"
}
```

## Building from Source

The cBot is provided as source code (`.cs` file). To compile:

1. Open cTrader Automate
2. Click "Build" in the toolbar
3. The compiled `.algo` file is created automatically

To export as `.algo`:
1. Right-click the cBot in Automate
2. Select "Build and Export"
3. Save the `.algo` file

## Support

For license issues, visit: https://hedge-edge.com/support
For technical issues, contact: support@hedge-edge.com

## Version History

- **1.0.0** (2026-01-31): Initial release
