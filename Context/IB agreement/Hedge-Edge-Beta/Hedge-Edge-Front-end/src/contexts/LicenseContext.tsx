/**
 * License Context for HedgeEdge Desktop App
 * 
 * Provides app-wide license state management with:
 * - Automatic status polling
 * - Device management
 * - Connected agent tracking
 * - Expiry warnings
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { isElectron } from '@/lib/desktop';

// ============================================================================
// Types
// ============================================================================

export type LicenseStatus = 'valid' | 'expired' | 'invalid' | 'not-configured' | 'checking' | 'error';

export type LicenseTier = 'demo' | 'professional' | 'enterprise';

export interface LicenseInfo {
  status: LicenseStatus;
  maskedKey?: string;
  lastChecked?: string;
  nextCheckAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  errorMessage?: string;
  features?: string[];
  email?: string;
  tier?: string;
  plan?: string;
  deviceId?: string;
  connectedAgents?: number;
  secureStorage?: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  platform: 'desktop' | 'mt5' | 'mt4' | 'ctrader';
  name?: string;
  registeredAt: string;
  lastSeenAt: string;
  version?: string;
  isCurrentDevice: boolean;
}

export interface ConnectedAgent {
  id: string;
  platform: 'mt5' | 'mt4' | 'ctrader';
  accountId: string;
  connectedAt: string;
  lastHeartbeat: string;
}

export interface LicenseContextValue {
  // State
  license: LicenseInfo | null;
  devices: DeviceInfo[];
  connectedAgents: ConnectedAgent[];
  isLoading: boolean;
  error: string | null;
  
  // Computed
  isValid: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  tier: LicenseTier | null;
  
  // Actions
  activate: (licenseKey: string) => Promise<{ success: boolean; error?: string }>;
  validate: (licenseKey: string) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
  remove: () => Promise<{ success: boolean; error?: string }>;
  deactivateDevice: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
  loadDevices: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const LicenseContext = createContext<LicenseContextValue | null>(null);

// ============================================================================
// Provider Props
// ============================================================================

interface LicenseProviderProps {
  children: React.ReactNode;
  /** Polling interval in milliseconds (default: 60000) */
  pollingInterval?: number;
  /** Hours before expiry to show warning (default: 24) */
  expiryWarningHours?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Provider Component
// ============================================================================

export function LicenseProvider({
  children,
  pollingInterval = 60000,
  expiryWarningHours = 24,
  debug = false,
}: LicenseProviderProps) {
  // State
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [connectedAgents, setConnectedAgents] = useState<ConnectedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Debug logger
  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debug) {
      console.log(`[LicenseContext] ${message}`, ...args);
    }
  }, [debug]);

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------

  const isValid = license?.status === 'valid';
  const isExpired = license?.status === 'expired';
  const isExpiringSoon = Boolean(
    license?.daysRemaining !== undefined && 
    license.daysRemaining <= (expiryWarningHours / 24) &&
    license.daysRemaining > 0
  );
  
  const tier: LicenseTier | null = license?.tier 
    ? (license.tier.toLowerCase() as LicenseTier)
    : license?.plan 
      ? (license.plan.toLowerCase() as LicenseTier)
      : null;

  // -------------------------------------------------------------------------
  // API Functions
  // -------------------------------------------------------------------------

  /**
   * Fetch current license status
   */
  const fetchStatus = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.license) {
      log('License API not available');
      setIsLoading(false);
      return;
    }

    try {
      log('Fetching license status...');
      const result = await window.electronAPI.license.getStatus();
      
      if (!mountedRef.current) return;
      
      if (result.success && result.data) {
        // Map LicenseStatusData to LicenseInfo
        const licenseInfo: LicenseInfo = {
          status: result.data.status || 'not-configured',
          maskedKey: result.data.maskedKey,
          lastChecked: result.data.lastChecked,
          nextCheckAt: result.data.nextCheckAt,
          expiresAt: result.data.expiresAt,
          daysRemaining: result.data.daysRemaining,
          errorMessage: result.data.errorMessage,
          features: result.data.features,
          email: result.data.email,
          tier: result.data.tier,
          plan: result.data.plan,
          deviceId: result.data.deviceId,
          connectedAgents: result.data.connectedAgents,
          secureStorage: result.data.secureStorage,
        };
        setLicense(licenseInfo);
        setError(null);
        log('License status updated:', licenseInfo.status);
      } else {
        setError(result.error || 'Failed to get license status');
        log('License status error:', result.error);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const errorMsg = err instanceof Error ? err.message : 'License check failed';
      setError(errorMsg);
      log('License status exception:', errorMsg);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [log]);

  /**
   * Load registered devices
   */
  const loadDevices = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.license) {
      return;
    }

    try {
      log('Loading devices...');
      const result = await window.electronAPI.license.getDevices();
      
      if (!mountedRef.current) return;
      
      if (result.success && result.data) {
        setDevices(result.data);
        log('Devices loaded:', result.data.length);
      }
    } catch (err) {
      log('Failed to load devices:', err);
    }
  }, [log]);

  /**
   * Load connected agents
   */
  const loadConnectedAgents = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.license) {
      return;
    }

    try {
      const result = await window.electronAPI.license.getConnectedAgents();
      
      if (!mountedRef.current) return;
      
      if (result.success && result.data) {
        setConnectedAgents(result.data);
      }
    } catch (err) {
      log('Failed to load connected agents:', err);
    }
  }, [log]);

  /**
   * Activate a license key
   */
  const activate = useCallback(async (licenseKey: string): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return { success: false, error: 'License API not available' };
    }

    log('Activating license...');
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.license.activate(licenseKey);
      
      if (result.success && result.license) {
        // Map LicenseStatusData to LicenseInfo
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
          plan: result.license.plan,
          deviceId: result.license.deviceId,
          connectedAgents: result.license.connectedAgents,
          secureStorage: result.license.secureStorage,
        };
        setLicense(licenseInfo);
        // Reload devices after activation
        await loadDevices();
        log('License activated successfully');
        return { success: true };
      } else {
        const errorMsg = result.error || 'Activation failed';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Activation failed';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  }, [loadDevices, log]);

  /**
   * Validate a license key (without storing)
   */
  const validate = useCallback(async (licenseKey: string): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return { success: false, error: 'License API not available' };
    }

    log('Validating license...');

    try {
      const result = await window.electronAPI.license.validate(licenseKey);
      
      if (result.success && result.data?.valid) {
        log('License validated successfully');
        return { success: true };
      } else {
        return { success: false, error: result.data?.message || result.error || 'Invalid license' };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Validation failed';
      return { success: false, error: errorMsg };
    }
  }, [log]);

  /**
   * Refresh license status
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return;
    }

    log('Refreshing license...');
    setIsLoading(true);

    try {
      const result = await window.electronAPI.license.refresh();
      
      if (!mountedRef.current) return;
      
      if (result.success && result.license) {
        // Map LicenseStatusData to LicenseInfo
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
          plan: result.license.plan,
          deviceId: result.license.deviceId,
          connectedAgents: result.license.connectedAgents,
          secureStorage: result.license.secureStorage,
        };
        setLicense(licenseInfo);
        setError(null);
        log('License refreshed successfully');
      } else {
        setError(result.error || 'Refresh failed');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [log]);

  /**
   * Remove the license
   */
  const remove = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return { success: false, error: 'License API not available' };
    }

    log('Removing license...');

    try {
      const result = await window.electronAPI.license.remove();
      
      if (result.success) {
        setLicense({ status: 'not-configured' });
        setDevices([]);
        setError(null);
        log('License removed successfully');
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Failed to remove license' };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to remove license';
      return { success: false, error: errorMsg };
    }
  }, [log]);

  /**
   * Deactivate a device
   */
  const deactivateDevice = useCallback(async (deviceId: string): Promise<{ success: boolean; error?: string }> => {
    if (!isElectron() || !window.electronAPI?.license) {
      return { success: false, error: 'License API not available' };
    }

    log('Deactivating device:', deviceId);

    try {
      const result = await window.electronAPI.license.deactivateDevice(deviceId);
      
      if (result.success) {
        // Reload devices list
        await loadDevices();
        log('Device deactivated successfully');
        return { success: true };
      } else {
        return { success: false, error: result.error || 'Failed to deactivate device' };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to deactivate device';
      return { success: false, error: errorMsg };
    }
  }, [loadDevices, log]);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    
    if (isElectron()) {
      fetchStatus();
      loadDevices();
      loadConnectedAgents();
    } else {
      setIsLoading(false);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [fetchStatus, loadDevices, loadConnectedAgents]);

  // Setup polling
  useEffect(() => {
    if (!isElectron()) return;

    pollingRef.current = setInterval(() => {
      fetchStatus();
      loadConnectedAgents();
    }, pollingInterval);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchStatus, loadConnectedAgents, pollingInterval]);

  // Expiry warning
  useEffect(() => {
    if (isExpiringSoon && license?.daysRemaining !== undefined) {
      console.warn(`[LicenseContext] License expires in ${license.daysRemaining} days!`);
    }
  }, [isExpiringSoon, license?.daysRemaining]);

  // -------------------------------------------------------------------------
  // Context Value
  // -------------------------------------------------------------------------

  const value: LicenseContextValue = {
    // State
    license,
    devices,
    connectedAgents,
    isLoading,
    error,
    
    // Computed
    isValid,
    isExpired,
    isExpiringSoon,
    tier,
    
    // Actions
    activate,
    validate,
    refresh,
    remove,
    deactivateDevice,
    loadDevices,
  };

  return (
    <LicenseContext.Provider value={value}>
      {children}
    </LicenseContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useLicense(): LicenseContextValue {
  const context = useContext(LicenseContext);
  
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  
  return context;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to check if a specific feature is available
 */
export function useLicenseFeature(feature: string): boolean {
  const { license, isValid } = useLicense();
  
  if (!isValid || !license?.features) {
    return false;
  }
  
  return license.features.includes(feature);
}

/**
 * Hook to get tier-based access level
 */
export function useLicenseTier(): {
  tier: LicenseTier | null;
  isDemo: boolean;
  isPro: boolean;
  isEnterprise: boolean;
} {
  const { tier } = useLicense();
  
  return {
    tier,
    isDemo: tier === 'demo',
    isPro: tier === 'professional' || tier === 'enterprise',
    isEnterprise: tier === 'enterprise',
  };
}

export default LicenseContext;
