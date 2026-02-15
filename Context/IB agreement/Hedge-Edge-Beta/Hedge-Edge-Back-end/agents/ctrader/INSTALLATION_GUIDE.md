# Hedge Edge cTrader cBot - Installation Guide

## Overview

This guide walks you through compiling, installing, and testing the Hedge Edge License cBot on cTrader. The cBot validates your Hedge Edge subscription license and streams live account data to the Hedge Edge desktop application.

---

## Prerequisites

Before you begin, ensure you have:

- ✅ **cTrader Desktop** version 4.0 or higher installed
- ✅ **Valid Hedge Edge subscription** with an active license key
- ✅ **Hedge Edge desktop app** installed (for receiving account data)
- ✅ **Internet connection** (for license validation)

---

## Step 1: Access cTrader Automate

1. **Launch cTrader Desktop**
   - Open cTrader from your Start menu or desktop shortcut
   - Log in to your broker account

2. **Open the Automate Tab**
   - Look at the bottom panel of cTrader
   - Click on the **"Automate"** tab (it may show a robot icon)
   - The Automate panel will expand showing cBots and Indicators

![Automate Tab Location](https://docs.ctrader.com/images/automate-tab.png)

---

## Step 2: Create New cBot Project

1. **Right-click on "cBots"** in the left sidebar
2. Select **"New cBot"** from the context menu
3. In the dialog that appears:
   - **Name:** `HedgeEdgeLicense`
   - Click **"Create"**

4. The code editor will open with a default template

---

## Step 3: Add the Source Code

1. **Clear the default template** (select all with Ctrl+A, then delete)

2. **Open the source file:**
   - Navigate to: `agents/ctrader/HedgeEdgeLicense.cs`
   - Open with any text editor (Notepad, VS Code, etc.)

3. **Copy the entire content** (Ctrl+A to select all, Ctrl+C to copy)

4. **Paste into cTrader** (Ctrl+V in the cTrader code editor)

5. **Verify the code is complete:**
   - The file should be approximately 717 lines
   - Check that it starts with the copyright header
   - Scroll to the bottom to verify the closing braces are present

---

## Step 4: Build the cBot

1. **Click the "Build" button** in the toolbar (or press **Ctrl+B**)

2. **Check the Build Output panel** at the bottom:
   ```
   Build started...
   Build succeeded. 0 Errors, 0 Warnings
   ```

3. **Verify success:**
   - ✅ Green checkmark appears next to the cBot name
   - ✅ "Build Succeeded" message in output
   - ✅ No error messages (warnings are acceptable)

### Common Build Errors

| Error | Solution |
|-------|----------|
| `Missing assembly reference` | cTrader includes all required assemblies - restart cTrader |
| `Type or namespace not found` | Verify all `using` statements at the top of file |
| `Access denied` | Run cTrader as Administrator |

---

## Step 5: Configure Permissions

The cBot requires **Full Access** permissions for:
- Making HTTPS requests to the license API
- Creating named pipes for communication with Hedge Edge app
- Accessing account information

**Permissions are set in the source code:**
```csharp
[Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.FullAccess)]
```

When you first run the cBot, cTrader may prompt you to approve these permissions.

---

## Step 6: Attach cBot to Chart

1. **Open a chart** for any symbol (e.g., EURUSD)

2. **Find HedgeEdgeLicense** in the cBots list (left sidebar under Automate)

3. **Attach to chart:**
   - **Option A:** Double-click the cBot name
   - **Option B:** Drag and drop onto the chart

4. **Configure Parameters** (a dialog will appear):

### Required Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **License Key** | `YOUR-LICENSE-KEY` | Your Hedge Edge subscription key |

### Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Device ID | Auto-generated | Leave empty for automatic generation |
| API Endpoint | `https://api.hedge-edge.com/v1/license/validate` | License API URL |
| Poll Interval | 600 | Seconds between license checks (10 min) |
| Status Channel | `HedgeEdgeCTrader` | Named pipe name for data streaming |
| Enable Commands | true | Allow remote commands from desktop app |
| Data Emit Interval | 1 | Seconds between position updates |

5. **Click "OK"** to start the cBot

---

## Step 7: Verify Successful Start

After starting, check for these indicators:

### On the Chart
- **Green text:** `Hedge Edge: Licensed - Active`
  - ✅ License validated successfully
  - ✅ Ready to stream data

- **Red text:** `Hedge Edge: License Invalid: [reason]`
  - ❌ Check your license key
  - ❌ Verify internet connection
  - ❌ Check API endpoint

### In the Automate Log
Look for these messages:
```
Hedge Edge License cBot starting...
License validated. Token expires: 2026-02-01T12:15:00Z
Waiting for Hedge Edge app connection on pipe: HedgeEdgeCTrader
Hedge Edge License cBot initialized successfully.
```

---

## Step 8: Connect to Hedge Edge Desktop App

1. **Open the Hedge Edge desktop app**

2. **Navigate to Accounts section**
   - The app will automatically connect to the named pipe
   - You should see your cTrader account appear

3. **Verify data is streaming:**
   - Balance and equity values should update
   - Open positions should be listed
   - Account status shows "Connected"

---

## Testing the Installation

### Test 1: License Validation
- ✅ cBot starts without errors
- ✅ Green "Licensed - Active" status on chart
- ✅ Log shows "License validated"

### Test 2: Data Streaming
- ✅ Desktop app shows account connected
- ✅ Balance and equity values match cTrader
- ✅ Positions appear when trades are opened

### Test 3: Remote Commands
From the desktop app, test:
- **PAUSE** - Status changes to "Licensed - Paused"
- **RESUME** - Status returns to "Licensed - Active"
- **STATUS** - Returns current account state

---

## Troubleshooting

### cBot won't start
1. Check license key is entered correctly
2. Verify internet connectivity
3. Ensure cTrader has network permissions in firewall

### "License Invalid" error
1. Verify license key in Hedge Edge dashboard
2. Check if license has expired
3. Ensure you haven't exceeded device limit

### Desktop app doesn't receive data
1. Ensure desktop app is running BEFORE starting cBot
2. Verify Status Channel name matches in both apps
3. Try running cTrader as Administrator
4. Check Windows Firewall isn't blocking named pipes

### Build fails with errors
1. Restart cTrader and try again
2. Create a new cBot project and re-paste the code
3. Verify all 717 lines were copied correctly

---

## Exporting the Compiled cBot

To share the compiled cBot:

1. Right-click on **HedgeEdgeLicense** in the cBots list
2. Select **"Build and Export"**
3. Choose a location to save the `.algo` file
4. This file can be shared with other users

**Note:** The `.algo` file requires cTrader 4.0+ to run.

---

## Uninstalling

To remove the cBot:

1. **Stop the cBot** if running (click Stop button)
2. **Right-click** on HedgeEdgeLicense in cBots list
3. Select **"Remove"**
4. Confirm deletion

---

## Support

- **License Issues:** https://hedge-edge.com/support
- **Technical Support:** support@hedge-edge.com
- **Documentation:** https://docs.hedge-edge.com/ctrader

---

## Version Information

| Component | Version |
|-----------|---------|
| cBot Version | 1.0.0 |
| Minimum cTrader | 4.0 |
| .NET Runtime | 6.0+ (bundled with cTrader) |
| Last Updated | 2026-02-01 |
