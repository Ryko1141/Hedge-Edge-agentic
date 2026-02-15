/**
 * React Hook for License Status Management
 * =========================================
 * Provides license status tracking and management via IPC.
 */

import { useState, useEffect, useCallback } from 'react';
import { isElectron } from '@/lib/desktop';
import type { LicenseInfo, LicenseStatus } from '@/types/connections';

// ============================================================================
// Types
// ============================================================================

export interface UseLicenseStatusReturn {
  /** Current license information */
  license: LicenseInfo | null;
  
  /** Current license status */
  status: LicenseStatus;
  
  /** Whether the license is valid */
  isValid: boolean;
  
  /** Whether the license is expired */
  isExpired: boolean;
  
  /** Whether there's a license error */
  hasError: boolean;
  
  /** Whether license is being checked */
  isLoading: boolean;
  
  /** Error message if any */
  error: string | null;
  
  /** Whether secure storage (OS keychain) is available */
  secureStorageAvailable: boolean | undefined;
  
  /** Activate a new license key */
  activate: (licenseKey: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Refresh license status */
  refresh: () => Promise<void>;
  
  /** Remove current license */
  remove: () => Promise<{ success: boolean; error?: string }>;
}

export interface UseLicenseStatusOptions {
  /** Polling interval in milliseconds (default: 60000 - 1 minute) */
  pollingInterval?: number;
  
  /** Whether to start polling automatically (default: true) */
  autoStart?: boolean;
  
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

const DEFAULT_OPTIONS: Required<UseLicenseStatusOptions> = {
  pollingInterval: 60000,
  autoStart: true,
  debug: false,
};

export function useLicenseStatus(options?: UseLicenseStatusOptions): UseLicenseStatusReturn {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState<boolean | undefined>(undefined);
  
  // Debug logger
  const log = useCallback((message: string, ...args: unknown[]) => {
    if (config.debug) {
      console.log(`[useLicenseStatus] ${message}`, ...args);
    }
  }, [config.debug]);

  // Fetch license status
  const fetchStatus = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.license) {
      log('License API not available');
      setIsLoading(false);
      return;
    }

    try {
      const result = await window.electronAPI.license.getStatus();
      if (result.success && result.data) {
        // Convert API response to LicenseInfo format
        const licenseInfo: LicenseInfo = {
          status: result.data.status || (result.data.valid ? 'valid' : 'not-configured'),
          maskedKey: result.data.maskedKey,
          lastChecked: result.data.lastChecked,
          nextCheckAt: result.data.nextCheckAt,
          expiresAt: result.data.expiresAt,
          daysRemaining: result.data.daysRemaining,
          errorMessage: result.data.errorMessage,
          features: result.data.features,
          email: result.data.email,
          tier: result.data.tier,
          secureStorage: result.data.secureStorage,
        };
        setLicense(licenseInfo);
        setError(null);
        // Update secure storage status from the response
        if (result.data.secureStorage !== undefined) {
          setSecureStorageAvailable(result.data.secureStorage);
        }
      } else {
        setError(result.error || 'Failed to get license status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License status check failed');
    } finally {
      setIsLoading(false);
    }
  }, [log]);

  // Initialize and set up polling
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.license || !config.autoStart) {
      setIsLoading(false);
      return;
    }

    log('Initializing license status tracking');
    setIsLoading(true);

    // Initial fetch
    fetchStatus();

    // Set up polling interval
    const intervalId = setInterval(() => {
      log('Polling license status');
      fetchStatus();
    }, config.pollingInterval);

    return () => {
      log('Cleaning up license polling');
      clearInterval(intervalId);
    };
  }, [config.autoStart, config.pollingInterval, fetchStatus, log]);

  // Activate a license key
  const activate = useCallback(async (licenseKey: string): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return { success: false, error: 'License API not available' };
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.license.activate(licenseKey);
      if (result.success && result.license) {
        // Convert API response to LicenseInfo format
        const licenseInfo: LicenseInfo = {
          status: result.license.status || 'valid',
          maskedKey: result.license.maskedKey,
          lastChecked: result.license.lastChecked,
          nextCheckAt: result.license.nextCheckAt,
          expiresAt: result.license.expiresAt,
          daysRemaining: result.license.daysRemaining,
          errorMessage: result.license.errorMessage,
          features: result.license.features,
          email: result.license.email,
          tier: result.license.tier,
          secureStorage: result.license.secureStorage,
        };
        setLicense(licenseInfo);
        if (result.license.secureStorage !== undefined) {
          setSecureStorageAvailable(result.license.secureStorage);
        }
        return { success: true };
      } else {
        setError(result.error || 'Activation failed');
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Activation failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh license status
  const refresh = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.license) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await window.electronAPI.license.refresh();
      if (result.success && result.license) {
        // Convert API response to LicenseInfo format
        const licenseInfo: LicenseInfo = {
          status: result.license.status || 'valid',
          maskedKey: result.license.maskedKey,
          lastChecked: result.license.lastChecked,
          nextCheckAt: result.license.nextCheckAt,
          expiresAt: result.license.expiresAt,
          daysRemaining: result.license.daysRemaining,
          errorMessage: result.license.errorMessage,
          features: result.license.features,
          email: result.license.email,
          tier: result.license.tier,
          secureStorage: result.license.secureStorage,
        };
        setLicense(licenseInfo);
        setError(null);
        if (result.license.secureStorage !== undefined) {
          setSecureStorageAvailable(result.license.secureStorage);
        }
      } else {
        setError(result.error || 'Refresh failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Remove license
  const remove = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return { success: false, error: 'License API not available' };
    }

    setIsLoading(true);

    try {
      const result = await window.electronAPI.license.remove();
      if (result.success) {
        setLicense(null);
        setError(null);
        return { success: true };
      } else {
        setError(result.error || 'Remove failed');
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Remove failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Computed values
  const status: LicenseStatus = license?.status || 'not-configured';
  const isValid = status === 'valid';
  const isExpired = status === 'expired';
  const hasError = status === 'error' || status === 'invalid';

  return {
    license,
    status,
    isValid,
    isExpired,
    hasError,
    isLoading,
    error,
    secureStorageAvailable,
    activate,
    refresh,
    remove,
  };
}
