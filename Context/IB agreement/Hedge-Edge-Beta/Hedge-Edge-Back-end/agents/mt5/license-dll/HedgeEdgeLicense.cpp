// ============================================================================
// Hedge Edge License DLL for MetaTrader 5
// Version: 1.0.0
// Copyright (c) 2026 Hedge Edge
// ============================================================================
// This DLL handles HTTPS license validation and token caching for the
// Hedge Edge MT5 Expert Advisor.
// ============================================================================
// Build: x64 Release, MT5-compatible calling convention (__stdcall)
// ============================================================================

#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS

#include <windows.h>
#include <winhttp.h>
#include <string>
#include <mutex>
#include <chrono>
#include <cstring>
#include <sstream>
#include <vector>

#pragma comment(lib, "winhttp.lib")

#include "HedgeEdgeLicense.h"

// ============================================================================
// Global State
// ============================================================================

namespace {
    std::mutex g_mutex;
    
    // Token cache
    std::string g_cachedToken;
    std::chrono::system_clock::time_point g_tokenExpiry;
    int g_tokenTTL = 0;
    
    // Configuration
    std::wstring g_endpointUrl = L"https://api.hedge-edge.com/v1/license/validate";
    std::wstring g_endpointHost;
    std::wstring g_endpointPath;
    int g_endpointPort = INTERNET_DEFAULT_HTTPS_PORT;
    bool g_useHttps = true;
    
    // Error tracking
    std::string g_lastError;
    
    // HTTP handles
    HINTERNET g_hSession = nullptr;
    
    // Retry configuration
    const int MAX_RETRIES = 3;
    const int BASE_RETRY_DELAY_MS = 1000;
    
    // Initialized flag
    bool g_initialized = false;
}

// ============================================================================
// Internal Helpers
// ============================================================================

// Convert UTF-8 to wide string
std::wstring Utf8ToWide(const char* utf8)
{
    if (!utf8 || !*utf8) return L"";
    
    int len = MultiByteToWideChar(CP_UTF8, 0, utf8, -1, nullptr, 0);
    if (len <= 0) return L"";
    
    std::wstring result(len, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, utf8, -1, &result[0], len);
    result.resize(len - 1); // Remove null terminator
    return result;
}

// Convert wide string to UTF-8
std::string WideToUtf8(const wchar_t* wide)
{
    if (!wide || !*wide) return "";
    
    int len = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 0) return "";
    
    std::string result(len, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide, -1, &result[0], len, nullptr, nullptr);
    result.resize(len - 1); // Remove null terminator
    return result;
}

// Parse URL into components
bool ParseUrl(const std::wstring& url)
{
    URL_COMPONENTS urlComp = { sizeof(URL_COMPONENTS) };
    wchar_t hostName[256] = { 0 };
    wchar_t urlPath[1024] = { 0 };
    
    urlComp.lpszHostName = hostName;
    urlComp.dwHostNameLength = sizeof(hostName) / sizeof(wchar_t);
    urlComp.lpszUrlPath = urlPath;
    urlComp.dwUrlPathLength = sizeof(urlPath) / sizeof(wchar_t);
    
    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &urlComp))
    {
        g_lastError = "Failed to parse URL";
        return false;
    }
    
    g_endpointHost = hostName;
    g_endpointPath = urlPath;
    g_endpointPort = urlComp.nPort;
    g_useHttps = (urlComp.nScheme == INTERNET_SCHEME_HTTPS);
    
    return true;
}

// Escape JSON string
std::string EscapeJson(const std::string& str)
{
    std::ostringstream result;
    for (char c : str)
    {
        switch (c)
        {
            case '"':  result << "\\\""; break;
            case '\\': result << "\\\\"; break;
            case '\b': result << "\\b"; break;
            case '\f': result << "\\f"; break;
            case '\n': result << "\\n"; break;
            case '\r': result << "\\r"; break;
            case '\t': result << "\\t"; break;
            default:
                if (c < 0x20)
                {
                    char buf[8];
                    sprintf(buf, "\\u%04x", (unsigned char)c);
                    result << buf;
                }
                else
                {
                    result << c;
                }
        }
    }
    return result.str();
}

// Simple JSON value extraction
std::string ExtractJsonValue(const std::string& json, const std::string& key)
{
    std::string searchKey = "\"" + key + "\":";
    size_t keyPos = json.find(searchKey);
    
    if (keyPos == std::string::npos)
        return "";
    
    size_t valueStart = keyPos + searchKey.length();
    
    // Skip whitespace
    while (valueStart < json.length() && (json[valueStart] == ' ' || json[valueStart] == '\t'))
        valueStart++;
    
    if (valueStart >= json.length())
        return "";
    
    if (json[valueStart] == '"')
    {
        // String value
        valueStart++;
        size_t valueEnd = json.find('"', valueStart);
        if (valueEnd == std::string::npos) return "";
        return json.substr(valueStart, valueEnd - valueStart);
    }
    else
    {
        // Non-string value
        size_t valueEnd = valueStart;
        while (valueEnd < json.length() && 
               json[valueEnd] != ',' && 
               json[valueEnd] != '}' && 
               json[valueEnd] != ']' &&
               json[valueEnd] != ' ')
        {
            valueEnd++;
        }
        return json.substr(valueStart, valueEnd - valueStart);
    }
}

// Perform HTTPS POST request
bool HttpPost(const std::string& requestBody, std::string& responseBody, int& httpStatus)
{
    if (!g_hSession)
    {
        g_lastError = "HTTP session not initialized";
        return false;
    }
    
    HINTERNET hConnect = nullptr;
    HINTERNET hRequest = nullptr;
    bool success = false;
    
    try
    {
        // Connect to server
        hConnect = WinHttpConnect(g_hSession, g_endpointHost.c_str(), g_endpointPort, 0);
        if (!hConnect)
        {
            g_lastError = "Failed to connect to server: " + std::to_string(GetLastError());
            throw std::exception();
        }
        
        // Create request
        DWORD flags = g_useHttps ? WINHTTP_FLAG_SECURE : 0;
        hRequest = WinHttpOpenRequest(hConnect, L"POST", g_endpointPath.c_str(),
                                       nullptr, WINHTTP_NO_REFERER,
                                       WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
        if (!hRequest)
        {
            g_lastError = "Failed to create request: " + std::to_string(GetLastError());
            throw std::exception();
        }
        
        // Set headers
        std::wstring headers = L"Content-Type: application/json\r\n";
        if (!WinHttpAddRequestHeaders(hRequest, headers.c_str(), -1, WINHTTP_ADDREQ_FLAG_ADD))
        {
            g_lastError = "Failed to add headers: " + std::to_string(GetLastError());
            throw std::exception();
        }
        
        // Set timeouts (30 seconds)
        DWORD timeout = 30000;
        WinHttpSetOption(hRequest, WINHTTP_OPTION_CONNECT_TIMEOUT, &timeout, sizeof(timeout));
        WinHttpSetOption(hRequest, WINHTTP_OPTION_SEND_TIMEOUT, &timeout, sizeof(timeout));
        WinHttpSetOption(hRequest, WINHTTP_OPTION_RECEIVE_TIMEOUT, &timeout, sizeof(timeout));
        
        // Enable TLS 1.2+
        DWORD secFlags = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2 | WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_3;
        WinHttpSetOption(hRequest, WINHTTP_OPTION_SECURE_PROTOCOLS, &secFlags, sizeof(secFlags));
        
        // Send request
        if (!WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                                (LPVOID)requestBody.c_str(), (DWORD)requestBody.length(),
                                (DWORD)requestBody.length(), 0))
        {
            DWORD err = GetLastError();
            if (err == ERROR_WINHTTP_SECURE_FAILURE)
            {
                g_lastError = "TLS/SSL certificate error";
            }
            else
            {
                g_lastError = "Failed to send request: " + std::to_string(err);
            }
            throw std::exception();
        }
        
        // Receive response
        if (!WinHttpReceiveResponse(hRequest, nullptr))
        {
            g_lastError = "Failed to receive response: " + std::to_string(GetLastError());
            throw std::exception();
        }
        
        // Get status code
        DWORD statusCode = 0;
        DWORD statusCodeSize = sizeof(statusCode);
        if (!WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                                  WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusCodeSize,
                                  WINHTTP_NO_HEADER_INDEX))
        {
            g_lastError = "Failed to get status code: " + std::to_string(GetLastError());
            throw std::exception();
        }
        httpStatus = static_cast<int>(statusCode);
        
        // Read response body
        responseBody.clear();
        DWORD bytesAvailable = 0;
        
        do
        {
            if (!WinHttpQueryDataAvailable(hRequest, &bytesAvailable))
            {
                g_lastError = "Failed to query data: " + std::to_string(GetLastError());
                throw std::exception();
            }
            
            if (bytesAvailable > 0)
            {
                std::vector<char> buffer(bytesAvailable + 1, 0);
                DWORD bytesRead = 0;
                
                if (WinHttpReadData(hRequest, buffer.data(), bytesAvailable, &bytesRead))
                {
                    responseBody.append(buffer.data(), bytesRead);
                }
            }
        } while (bytesAvailable > 0);
        
        success = true;
    }
    catch (...)
    {
        // Error already set
    }
    
    // Cleanup
    if (hRequest) WinHttpCloseHandle(hRequest);
    if (hConnect) WinHttpCloseHandle(hConnect);
    
    return success;
}

// ============================================================================
// Exported Functions
// ============================================================================

extern "C" {

HEDGEEDGE_API int __stdcall InitializeLibrary()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_initialized)
    {
        return 0; // Already initialized
    }
    
    // Create HTTP session
    g_hSession = WinHttpOpen(L"HedgeEdge/1.0",
                             WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                             WINHTTP_NO_PROXY_NAME,
                             WINHTTP_NO_PROXY_BYPASS, 0);
    
    if (!g_hSession)
    {
        g_lastError = "Failed to create HTTP session: " + std::to_string(GetLastError());
        return -1;
    }
    
    // Parse default endpoint
    if (!ParseUrl(g_endpointUrl))
    {
        WinHttpCloseHandle(g_hSession);
        g_hSession = nullptr;
        return -2;
    }
    
    g_initialized = true;
    return 0;
}

HEDGEEDGE_API void __stdcall ShutdownLibrary()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (!g_initialized)
    {
        return;
    }
    
    // Clear cache
    g_cachedToken.clear();
    g_tokenTTL = 0;
    
    // Close HTTP session
    if (g_hSession)
    {
        WinHttpCloseHandle(g_hSession);
        g_hSession = nullptr;
    }
    
    g_initialized = false;
}

HEDGEEDGE_API void __stdcall SetEndpoint(const char* url)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (!url || !*url)
    {
        return;
    }
    
    std::wstring wideUrl = Utf8ToWide(url);
    
    if (ParseUrl(wideUrl))
    {
        g_endpointUrl = wideUrl;
    }
}

HEDGEEDGE_API int __stdcall ValidateLicense(
    const char* key,
    const char* account,
    const char* broker,
    const char* deviceId,
    const char* endpointUrl,
    char* outToken,
    char* outError)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (!g_initialized)
    {
        if (outError)
        {
            strncpy(outError, "Library not initialized", 255);
        }
        return -1;
    }
    
    // Check if we have a valid cached token
    auto now = std::chrono::system_clock::now();
    if (!g_cachedToken.empty() && now < g_tokenExpiry)
    {
        // Return cached token
        if (outToken)
        {
            strncpy(outToken, g_cachedToken.c_str(), 511);
        }
        return 0;
    }
    
    // Update endpoint if provided
    if (endpointUrl && *endpointUrl)
    {
        std::wstring wideUrl = Utf8ToWide(endpointUrl);
        if (!wideUrl.empty())
        {
            ParseUrl(wideUrl);
        }
    }
    
    // Build request JSON
    std::ostringstream requestJson;
    requestJson << "{";
    requestJson << "\"licenseKey\":\"" << EscapeJson(key ? key : "") << "\",";
    requestJson << "\"accountId\":\"" << EscapeJson(account ? account : "") << "\",";
    requestJson << "\"broker\":\"" << EscapeJson(broker ? broker : "") << "\",";
    requestJson << "\"deviceId\":\"" << EscapeJson(deviceId ? deviceId : "") << "\",";
    requestJson << "\"platform\":\"MT5\",";
    requestJson << "\"version\":\"1.0.0\"";
    requestJson << "}";
    
    std::string requestBody = requestJson.str();
    std::string responseBody;
    int httpStatus = 0;
    
    // Retry loop with exponential backoff
    bool success = false;
    for (int attempt = 0; attempt < MAX_RETRIES && !success; attempt++)
    {
        if (attempt > 0)
        {
            // Exponential backoff
            int delayMs = BASE_RETRY_DELAY_MS * (1 << (attempt - 1));
            Sleep(delayMs);
        }
        
        success = HttpPost(requestBody, responseBody, httpStatus);
    }
    
    if (!success)
    {
        if (outError)
        {
            strncpy(outError, g_lastError.c_str(), 255);
        }
        return -2;
    }
    
    // Check HTTP status
    if (httpStatus != 200)
    {
        g_lastError = "HTTP " + std::to_string(httpStatus) + ": " + responseBody;
        if (outError)
        {
            strncpy(outError, g_lastError.c_str(), 255);
        }
        return -3;
    }
    
    // Parse response
    std::string valid = ExtractJsonValue(responseBody, "valid");
    
    if (valid != "true")
    {
        std::string message = ExtractJsonValue(responseBody, "message");
        g_lastError = message.empty() ? "License invalid" : message;
        
        if (outError)
        {
            strncpy(outError, g_lastError.c_str(), 255);
        }
        
        // Clear cache
        g_cachedToken.clear();
        g_tokenTTL = 0;
        
        return -4;
    }
    
    // Extract token and TTL
    std::string token = ExtractJsonValue(responseBody, "token");
    std::string ttlStr = ExtractJsonValue(responseBody, "ttlSeconds");
    
    int ttl = 900; // Default 15 minutes
    if (!ttlStr.empty())
    {
        ttl = std::stoi(ttlStr);
        if (ttl <= 0) ttl = 900;
    }
    
    // Cache token
    g_cachedToken = token;
    g_tokenTTL = ttl;
    g_tokenExpiry = std::chrono::system_clock::now() + std::chrono::seconds(ttl);
    
    // Copy token to output
    if (outToken)
    {
        strncpy(outToken, token.c_str(), 511);
    }
    
    g_lastError.clear();
    return 0;
}

HEDGEEDGE_API int __stdcall GetCachedToken(char* outToken, int tokenLen)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_cachedToken.empty())
    {
        return -1;
    }
    
    auto now = std::chrono::system_clock::now();
    if (now >= g_tokenExpiry)
    {
        return -2; // Token expired
    }
    
    if (outToken && tokenLen > 0)
    {
        strncpy(outToken, g_cachedToken.c_str(), tokenLen - 1);
        outToken[tokenLen - 1] = '\0';
    }
    
    return 0;
}

HEDGEEDGE_API int __stdcall IsTokenValid()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_cachedToken.empty())
    {
        return 0;
    }
    
    auto now = std::chrono::system_clock::now();
    return (now < g_tokenExpiry) ? 1 : 0;
}

HEDGEEDGE_API int __stdcall GetTokenTTL()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (g_cachedToken.empty())
    {
        return 0;
    }
    
    auto now = std::chrono::system_clock::now();
    if (now >= g_tokenExpiry)
    {
        return 0;
    }
    
    auto remaining = std::chrono::duration_cast<std::chrono::seconds>(g_tokenExpiry - now);
    return static_cast<int>(remaining.count());
}

HEDGEEDGE_API void __stdcall ClearCache()
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    g_cachedToken.clear();
    g_tokenTTL = 0;
    g_tokenExpiry = std::chrono::system_clock::time_point();
    g_lastError.clear();
}

HEDGEEDGE_API void __stdcall GetLastError(char* outError, int errorLen)
{
    std::lock_guard<std::mutex> lock(g_mutex);
    
    if (outError && errorLen > 0)
    {
        strncpy(outError, g_lastError.c_str(), errorLen - 1);
        outError[errorLen - 1] = '\0';
    }
}

} // extern "C"

// ============================================================================
// DLL Entry Point
// ============================================================================

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved)
{
    switch (ul_reason_for_call)
    {
        case DLL_PROCESS_ATTACH:
            DisableThreadLibraryCalls(hModule);
            break;
            
        case DLL_PROCESS_DETACH:
            // Cleanup if not already done
            if (g_initialized)
            {
                ShutdownLibrary();
            }
            break;
    }
    return TRUE;
}
