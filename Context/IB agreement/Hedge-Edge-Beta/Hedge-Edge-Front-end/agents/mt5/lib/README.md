# MT5 Libraries Directory

This directory is for **documentation purposes only**. The actual DLL files must be placed in your MT5 terminal's `MQL5/Libraries/` folder.

## Required DLLs for ZMQ Mode

### libzmq.dll (ZeroMQ)

High-performance messaging library for real-time communication between the EA and Hedge Edge app.

**Download:**
- Source: https://github.com/zeromq/libzmq/releases
- Version: 4.3.4 or later (x64)
- File: `zeromq-4.3.4-win-x64.zip` → `bin/libzmq.dll`

**Installation:**
```
Copy to: <MT5 Data Folder>/MQL5/Libraries/libzmq.dll
```

### libsodium.dll (Cryptography)

Modern cryptographic library for encrypted license validation.

**Download:**
- Source: https://download.libsodium.org/libsodium/releases/
- Version: 1.0.18 or later (x64)
- File: `libsodium-1.0.18-msvc.zip` → `x64/Release/v142/dynamic/libsodium.dll`

**Installation:**
```
Copy to: <MT5 Data Folder>/MQL5/Libraries/libsodium.dll
```

### HedgeEdgeLicense.dll (Legacy/Fallback)

Optional legacy DLL for fallback mode when ZMQ is not available.

**Installation:**
```
Copy to: <MT5 Data Folder>/MQL5/Libraries/HedgeEdgeLicense.dll
```

## Finding Your MT5 Data Folder

1. Open MetaTrader 5
2. Go to **File** → **Open Data Folder**
3. Navigate to `MQL5/Libraries/`

Example paths:
- `C:\Users\<Username>\AppData\Roaming\MetaQuotes\Terminal\<ID>\MQL5\Libraries\`
- `C:\Program Files\MetaTrader 5\MQL5\Libraries\` (portable installation)

## Verifying Installation

After copying the DLLs, verify they're accessible:

1. Open MetaEditor (F4 in MT5)
2. Create a test script:

```mql5
#import "libzmq.dll"
   void zmq_version(int &major, int &minor, int &patch);
#import

void OnStart()
{
   int major, minor, patch;
   zmq_version(major, minor, patch);
   Print("ZMQ Version: ", major, ".", minor, ".", patch);
}
```

3. Compile and run - you should see the ZMQ version in the Experts log

## Troubleshooting

### "Cannot load library"

1. **Wrong architecture**: Ensure you downloaded the **x64** version
2. **Missing dependencies**: Install Visual C++ Redistributable 2015-2022
3. **File not found**: Verify the DLL is in `MQL5/Libraries/`, not a subfolder

### "DLL imports not allowed"

Enable in MT5:
- **Tools** → **Options** → **Expert Advisors** → ✅ "Allow DLL imports"
- When attaching EA: ✅ "Allow DLL imports" checkbox

### "Entry point not found"

The DLL version might be incompatible. Download the recommended versions listed above.
