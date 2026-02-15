// ============================================================================
// Hedge Edge License DLL Header
// Version: 1.0.0
// Copyright (c) 2026 Hedge Edge
// ============================================================================
// This header defines the exported functions for the Hedge Edge License DLL
// used by MetaTrader 5 Expert Advisors.
// ============================================================================

#ifndef HEDGE_EDGE_LICENSE_H
#define HEDGE_EDGE_LICENSE_H

#ifdef __cplusplus
extern "C" {
#endif

// Export/Import macro
#ifdef HEDGEEDGE_EXPORTS
    #define HEDGEEDGE_API __declspec(dllexport)
#else
    #define HEDGEEDGE_API __declspec(dllimport)
#endif

// ============================================================================
// Return Codes
// ============================================================================
// 
//  0 = Success
// -1 = Library not initialized
// -2 = Network/HTTP error
// -3 = HTTP status error (non-200)
// -4 = License invalid/expired
// -5 = Parameter error
//
// ============================================================================

// ============================================================================
// Library Lifecycle
// ============================================================================

/**
 * Initialize the license library.
 * Must be called before any other functions.
 * 
 * @return 0 on success, negative error code on failure
 */
HEDGEEDGE_API int __stdcall InitializeLibrary();

/**
 * Shutdown the license library and release resources.
 * Call this when the EA is being unloaded.
 */
HEDGEEDGE_API void __stdcall ShutdownLibrary();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Set the license API endpoint URL.
 * 
 * @param url The full URL to the license validation endpoint (UTF-8)
 */
HEDGEEDGE_API void __stdcall SetEndpoint(const char* url);

// ============================================================================
// License Validation
// ============================================================================

/**
 * Validate a license key with the Hedge Edge server.
 * On success, the token is cached internally for subsequent calls.
 * 
 * @param key         License key string (UTF-8, required)
 * @param account     MT5 account ID/login (UTF-8, required)
 * @param broker      Broker name (UTF-8, required)
 * @param deviceId    Unique device identifier (UTF-8, required)
 * @param endpointUrl Optional override URL (UTF-8, can be NULL to use default)
 * @param outToken    Buffer to receive the auth token (min 512 chars, can be NULL)
 * @param outError    Buffer to receive error message (min 256 chars, can be NULL)
 * 
 * @return 0 on success, negative error code on failure
 * 
 * Error codes:
 *   -1 = Library not initialized
 *   -2 = Network error (connection failed, timeout, etc.)
 *   -3 = HTTP error (non-200 status code)
 *   -4 = License invalid or expired
 */
HEDGEEDGE_API int __stdcall ValidateLicense(
    const char* key,
    const char* account,
    const char* broker,
    const char* deviceId,
    const char* endpointUrl,
    char* outToken,
    char* outError
);

// ============================================================================
// Token Cache Management
// ============================================================================

/**
 * Get the currently cached token.
 * 
 * @param outToken  Buffer to receive the token
 * @param tokenLen  Size of the buffer in characters
 * 
 * @return 0 if token is valid and copied,
 *        -1 if no token cached,
 *        -2 if token expired
 */
HEDGEEDGE_API int __stdcall GetCachedToken(char* outToken, int tokenLen);

/**
 * Check if the cached token is still valid (not expired).
 * 
 * @return 1 if valid, 0 if expired or no token cached
 */
HEDGEEDGE_API int __stdcall IsTokenValid();

/**
 * Get the remaining time-to-live of the cached token in seconds.
 * 
 * @return Seconds remaining, or 0 if expired/no token
 */
HEDGEEDGE_API int __stdcall GetTokenTTL();

/**
 * Clear the cached token and reset state.
 */
HEDGEEDGE_API void __stdcall ClearCache();

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Get the last error message.
 * 
 * @param outError  Buffer to receive the error message
 * @param errorLen  Size of the buffer in characters
 */
HEDGEEDGE_API void __stdcall GetLastError(char* outError, int errorLen);

#ifdef __cplusplus
}
#endif

#endif // HEDGE_EDGE_LICENSE_H
