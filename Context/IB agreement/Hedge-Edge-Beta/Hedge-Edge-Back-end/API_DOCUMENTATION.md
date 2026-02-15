# Hedge Edge License API Documentation

## Overview

The Hedge Edge License Validation API provides secure license management for MT4/MT5/cTrader trading agents. The API handles license validation, session management, and device tracking.

**Production URL:** `https://api.hedge-edge.com`  
**Version:** 1.0.0  
**SSL/TLS:** Required (TLS 1.2+)

---

## Authentication

All license operations require a valid license key. After successful validation, a session token is returned which should be used for subsequent heartbeat calls.

---

## Rate Limiting

- **Limit:** 100 requests per minute per IP address
- **Headers:** Rate limit info is returned in response headers:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining in window
  - `X-RateLimit-Reset`: Unix timestamp when window resets

---

## Endpoints

### 1. Validate License

Validates a license key and registers the device. Returns a session token for authenticated operations.

**Endpoint:** `POST /v1/license/validate`

#### Request

```json
{
  "licenseKey": "YOUR-LICENSE-KEY-HERE",
  "deviceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "platform": "mt5",
  "accountId": "12345678",
  "broker": "ICMarkets",
  "version": "1.0.0"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `licenseKey` | string | Yes | The license key to validate (8-64 chars) |
| `deviceId` | string | Yes | Unique device identifier (8-255 chars) |
| `platform` | string | No | Platform type: `mt4`, `mt5`, `ctrader`, `desktop` |
| `accountId` | string | No | Broker account number |
| `broker` | string | No | Broker name |
| `version` | string | No | Agent version number |

#### Success Response (200)

```json
{
  "valid": true,
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
  "ttlSeconds": 3600,
  "plan": "professional",
  "features": ["trade-copying", "hedge-detection", "multi-account", "analytics", "api-access"],
  "expiresAt": "2027-01-01T00:00:00Z",
  "email": "user@example.com",
  "devicesUsed": 1,
  "maxDevices": 3
}
```

#### Error Responses

**401 - Invalid License Key**
```json
{
  "valid": false,
  "message": "Invalid license key",
  "code": "ERROR_INVALID_KEY"
}
```

**403 - License Expired**
```json
{
  "valid": false,
  "message": "License has expired",
  "code": "ERROR_EXPIRED",
  "expiresAt": "2025-01-01T00:00:00Z"
}
```

**403 - Device Limit Reached**
```json
{
  "valid": false,
  "message": "Device limit reached (3/3). Deactivate another device first.",
  "code": "ERROR_DEVICE_LIMIT",
  "devicesUsed": 3,
  "maxDevices": 3
}
```

---

### 2. Heartbeat

Keeps the session alive and reports device status. Should be called periodically (recommended: every 5-10 minutes).

**Endpoint:** `POST /v1/license/heartbeat`

#### Request

```json
{
  "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
  "deviceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "status": {
    "balance": 10000.00,
    "equity": 10250.50,
    "positions": 3,
    "profit": 250.50
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Current session token (64 chars) |
| `deviceId` | string | Yes | Device identifier |
| `status` | object | No | Optional status data (balance, equity, etc.) |

#### Success Response (200)

```json
{
  "valid": true,
  "newToken": null,
  "ttlSeconds": 3245
}
```

If the token is near expiry (< 5 minutes), a new token is automatically generated:

```json
{
  "valid": true,
  "newToken": "new-token-here-64-characters-long-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "ttlSeconds": 3600
}
```

#### Error Responses

**401 - Invalid/Expired Session**
```json
{
  "valid": false,
  "message": "Invalid or expired session token",
  "code": "HTTP_401"
}
```

---

### 3. Deactivate Device

Deactivates a device to free up a license slot for use on another device.

**Endpoint:** `POST /v1/license/deactivate`

#### Request

```json
{
  "licenseKey": "YOUR-LICENSE-KEY-HERE",
  "deviceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `licenseKey` | string | Yes | The license key |
| `deviceId` | string | Yes | Device to deactivate |

#### Success Response (200)

```json
{
  "success": true,
  "devicesRemaining": 2
}
```

#### Error Responses

**401 - Invalid License Key**
```json
{
  "valid": false,
  "message": "Invalid license key",
  "code": "HTTP_401"
}
```

**404 - Device Not Found**
```json
{
  "valid": false,
  "message": "Device not found or already deactivated",
  "code": "HTTP_404"
}
```

---

### 4. Server Status

Returns server health and statistics.

**Endpoint:** `GET /v1/license/status`

#### Response (200)

```json
{
  "status": "online",
  "timestamp": "2026-02-01T12:00:00Z",
  "version": "1.0.0",
  "activeLicenses": 150,
  "totalDevices": 320
}
```

---

### 5. Health Check

Simple health check for load balancers and monitoring.

**Endpoint:** `GET /health`

#### Response (200)

```json
{
  "status": "healthy",
  "timestamp": "2026-02-01T12:00:00Z"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `ERROR_INVALID_KEY` | License key not found in database |
| `ERROR_EXPIRED` | License has passed its expiration date |
| `ERROR_INACTIVE` | License has been deactivated by admin |
| `ERROR_DEVICE_LIMIT` | Maximum device count reached |
| `ERROR_INTERNAL` | Server-side error occurred |
| `HTTP_401` | Authentication failed |
| `HTTP_403` | Access forbidden |
| `HTTP_404` | Resource not found |
| `HTTP_429` | Rate limit exceeded |

---

## Code Examples

### MT5 MQL5 (WebRequest)

```mql5
string ValidateLicense(string licenseKey, string deviceId)
{
    string url = "https://api.hedge-edge.com/v1/license/validate";
    string headers = "Content-Type: application/json\r\n";
    
    string body = StringFormat(
        "{\"licenseKey\":\"%s\",\"deviceId\":\"%s\",\"platform\":\"mt5\",\"accountId\":\"%d\",\"broker\":\"%s\",\"version\":\"1.0.0\"}",
        licenseKey, deviceId, AccountInfoInteger(ACCOUNT_LOGIN), AccountInfoString(ACCOUNT_COMPANY)
    );
    
    char data[], result[];
    StringToCharArray(body, data, 0, StringLen(body));
    
    int timeout = 5000;
    string responseHeaders;
    
    int res = WebRequest("POST", url, headers, timeout, data, result, responseHeaders);
    
    if (res == 200)
    {
        string response = CharArrayToString(result);
        // Parse JSON response to extract token
        return response;
    }
    
    return "";
}
```

### cTrader C#

```csharp
using System.Net.Http;
using System.Text.Json;

public async Task<LicenseResponse> ValidateLicenseAsync(string licenseKey, string deviceId)
{
    var client = new HttpClient();
    var content = new StringContent(JsonSerializer.Serialize(new
    {
        licenseKey = licenseKey,
        deviceId = deviceId,
        platform = "ctrader",
        accountId = Account.Number.ToString(),
        broker = Account.BrokerName,
        version = "1.0.0"
    }), Encoding.UTF8, "application/json");
    
    var response = await client.PostAsync(
        "https://api.hedge-edge.com/v1/license/validate",
        content
    );
    
    var json = await response.Content.ReadAsStringAsync();
    return JsonSerializer.Deserialize<LicenseResponse>(json);
}
```

### Python

```python
import requests

def validate_license(license_key: str, device_id: str) -> dict:
    response = requests.post(
        "https://api.hedge-edge.com/v1/license/validate",
        json={
            "licenseKey": license_key,
            "deviceId": device_id,
            "platform": "desktop",
            "version": "1.0.0"
        },
        timeout=10
    )
    return response.json()
```

### JavaScript/TypeScript (Electron)

```typescript
async function validateLicense(licenseKey: string, deviceId: string): Promise<LicenseResponse> {
    const response = await fetch('https://api.hedge-edge.com/v1/license/validate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            licenseKey,
            deviceId,
            platform: 'desktop',
            version: '1.0.0'
        })
    });
    
    return response.json();
}
```

---

## Best Practices

1. **Device ID Generation**: Use a stable, unique identifier (hardware ID, MAC address hash, or generated UUID stored locally)

2. **Token Storage**: Store the session token securely and refresh before expiry

3. **Heartbeat Interval**: Call heartbeat every 5-10 minutes to maintain session

4. **Error Handling**: Implement retry logic with exponential backoff for network errors

5. **Offline Mode**: Cache the last successful validation for brief offline periods

6. **Rate Limiting**: Implement client-side rate limiting to avoid hitting server limits

---

## Support

- **Documentation**: https://docs.hedge-edge.com
- **Email**: support@hedge-edge.com
- **Status Page**: https://status.hedge-edge.com
