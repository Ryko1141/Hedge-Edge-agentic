import { logger } from '@/lib/logger';

/**
 * MT5 Password Storage
 * ====================
 * Production: Uses Electron's safeStorage API for OS-level encryption
 *             (Windows DPAPI, macOS Keychain, Linux Secret Service)
 *
 * Encrypted blobs are stored in the main-process filesystem via IPC,
 * NOT in renderer localStorage. This prevents any renderer-side script
 * from accessing ciphertext.
 *
 * SECURITY: No plaintext fallback. If safeStorage is unavailable,
 * passwords are NOT cached — users must re-enter each session.
 *
 * Passwords are encrypted before storage and automatically expire after 24 hours.
 */

// Legacy keys — kept only for one-time cleanup of old renderer-side data
const LEGACY_ENCRYPTED_KEY = 'mt5_encrypted_cache';
const LEGACY_PLAINTEXT_KEY = 'mt5_passwords_cache';

/**
 * Check if running in Electron with secure storage available
 */
async function isSecureStorageAvailable(): Promise<boolean> {
  try {
    return window.electronAPI?.secureStorage?.isAvailable?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * Check if the main-process password cache IPC is available
 */
function hasPasswordCacheIPC(): boolean {
  return !!window.electronAPI?.passwordCache;
}

/**
 * Purge any legacy data from renderer localStorage/sessionStorage.
 * Called defensively to clean up old data from previous versions.
 */
function purgeLegacyRendererStorage(): void {
  try {
    localStorage.removeItem(LEGACY_ENCRYPTED_KEY);
    sessionStorage.removeItem(LEGACY_PLAINTEXT_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Get cached password for an account.
 * Only returns a result when safeStorage (OS keychain) and main-process IPC are available.
 */
export async function getCachedPassword(login: string, server: string): Promise<string | null> {
  try {
    if (!(await isSecureStorageAvailable()) || !hasPasswordCacheIPC()) {
      return null;
    }

    // Retrieve encrypted blob from main-process filesystem
    const result = await window.electronAPI!.passwordCache.retrieve(login, server);
    if (!result.success || !result.data) return null;

    // Decrypt via OS keychain
    const decryptResult = await window.electronAPI!.secureStorage.decrypt(result.data);
    if (decryptResult.success && decryptResult.data) {
      return decryptResult.data;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Cache password for an account.
 * Encrypts via safeStorage, then stores the encrypted blob in the main process.
 * SECURITY: No plaintext fallback — if safeStorage or IPC is unavailable, password is not stored.
 */
export async function cachePassword(login: string, password: string, server: string): Promise<void> {
  try {
    if (!(await isSecureStorageAvailable()) || !hasPasswordCacheIPC()) {
      logger.warn('safeStorage or IPC unavailable — password will not be cached', { component: 'PasswordCache' });
      return;
    }

    const encryptResult = await window.electronAPI!.secureStorage.encrypt(password);
    if (!encryptResult.success || !encryptResult.data) {
      logger.warn('Encryption failed — password will not be cached', { component: 'PasswordCache' });
      return;
    }

    // Store encrypted blob in main-process filesystem (not renderer localStorage)
    await window.electronAPI!.passwordCache.store(login, encryptResult.data, server);

    // Defensively purge any legacy renderer-side data
    purgeLegacyRendererStorage();
  } catch (error) {
    logger.error('Failed to cache password', { component: 'PasswordCache', error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Remove cached password for a specific account.
 */
export async function removeCachedPassword(login: string, server: string): Promise<void> {
  try {
    if (hasPasswordCacheIPC()) {
      await window.electronAPI!.passwordCache.remove(login, server);
    }
  } catch (error) {
    logger.error('Failed to remove cached password', { component: 'PasswordCache', error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Clear ALL cached passwords — main-process store and any legacy renderer remnants.
 * Call this on user signout.
 */
export async function clearAllCachedPasswords(): Promise<void> {
  if (hasPasswordCacheIPC()) {
    await window.electronAPI!.passwordCache.clear();
  }
  // Purge any legacy renderer-side data
  purgeLegacyRendererStorage();
}

/**
 * Check if password is cached for an account
 */
export async function hasPasswordCached(login: string, server: string): Promise<boolean> {
  return (await getCachedPassword(login, server)) !== null;
}
