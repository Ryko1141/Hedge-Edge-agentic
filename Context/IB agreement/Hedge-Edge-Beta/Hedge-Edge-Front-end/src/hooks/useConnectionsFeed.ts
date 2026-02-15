/**
 * React Hook for Connection Management Feed
 * ==========================================
 * Subscribes to IPC connection snapshots and manages multi-account connection state.
 * Patterns after useMT5LiveFeed.ts for consistency.
 * 
 * For web builds, returns a graceful "desktop-only" state without errors.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  connectionSupervisor,
  isConnectionsApiAvailable,
  buildConnectParams,
  formatConnectionStatus,
} from '@/lib/desktop';
import type {
  ConnectionSnapshot,
  ConnectionSnapshotMap,
  ConnectParams,
  ConnectionStatus,
  ConnectionMetrics,
  ConnectionPosition,
  UseConnectionsFeedReturn,
  UseConnectionsFeedOptions,
} from '@/types/connections';

// Re-export types for convenience
export type {
  ConnectionSnapshot,
  ConnectionSnapshotMap,
  ConnectParams,
  ConnectionStatus,
  ConnectionMetrics,
  ConnectionPosition,
};

const DEFAULT_OPTIONS: Required<UseConnectionsFeedOptions> = {
  pollingInterval: 3000,
  autoStart: true,
  debug: false,
};

/**
 * Custom hook to manage multi-account connection state via IPC bridge
 * 
 * For web builds, returns a graceful "desktop-only" state without errors.
 * 
 * @param options - Configuration options
 * @returns Connection management interface
 * 
 * @example
 * ```tsx
 * const { 
 *   snapshots, 
 *   connect, 
 *   disconnect, 
 *   isConnected,
 *   getSnapshot 
 * } = useConnectionsFeed();
 * 
 * // Connect an account
 * await connect({
 *   accountId: account.id,
 *   platform: 'mt5',
 *   role: 'local',
 *   credentials: { login, password, server },
 * });
 * 
 * // Check status
 * if (isConnected(account.id)) {
 *   const snapshot = getSnapshot(account.id);
 *   console.log('Balance:', snapshot?.metrics?.balance);
 * }
 * ```
 */
export function useConnectionsFeed(options?: UseConnectionsFeedOptions): UseConnectionsFeedReturn {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [snapshots, setSnapshots] = useState<ConnectionSnapshotMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track if API is available
  const [apiAvailable] = useState(() => isConnectionsApiAvailable());
  
  // Toast throttling
  const toastCountRef = useRef(0);
  const lastToastErrorRef = useRef<string | null>(null);
  
  const { toast } = useToast();

  // Debug logger
  const log = useCallback((message: string, ...args: unknown[]) => {
    if (config.debug) {
      console.log(`[useConnectionsFeed] ${message}`, ...args);
    }
  }, [config.debug]);

  // Show throttled toast for errors
  const showErrorToast = useCallback((title: string, description: string) => {
    const errorKey = `${title}:${description}`;
    const isNewError = lastToastErrorRef.current !== errorKey;
    
    if (isNewError) {
      toastCountRef.current = 0;
      lastToastErrorRef.current = errorKey;
    }
    
    toastCountRef.current++;
    
    // Only show toast for first 3 occurrences of same error
    if (toastCountRef.current <= 3) {
      toast({
        title,
        description: toastCountRef.current === 3 
          ? `${description} (muting further alerts)`
          : description,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Initialize supervisor and subscribe to updates
  useEffect(() => {
    if (!apiAvailable) {
      log('API not available, skipping initialization');
      setIsLoading(false);
      setError(null); // Not an error - just not available
      return;
    }

    if (!config.autoStart) {
      setIsLoading(false);
      return;
    }

    log('Initializing connection supervisor');
    setIsLoading(true);

    // Initialize supervisor
    connectionSupervisor.initialize(config.pollingInterval).then(() => {
      log('Supervisor initialized');
      setIsLoading(false);
    }).catch((err) => {
      console.error('[useConnectionsFeed] Initialization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize');
      setIsLoading(false);
    });

    // Subscribe to updates
    const unsubscribe = connectionSupervisor.subscribe((newSnapshots) => {
      log('Received snapshot update', Object.keys(newSnapshots).length, 'accounts');
      setSnapshots(newSnapshots);
    });

    // Cleanup
    return () => {
      log('Cleaning up subscription');
      unsubscribe();
    };
  }, [apiAvailable, config.autoStart, config.pollingInterval, log]);

  /**
   * Get snapshot for a specific account.
   * Looks up by exact key first, then falls back to matching by mt5Login
   * (connection keys are "mt5-<login>" but callers may pass raw login).
   */
  const getSnapshot = useCallback((accountId: string): ConnectionSnapshot | null => {
    // Direct key match (e.g., "mt5-11789976" or Supabase UUID)
    if (snapshots[accountId]) return snapshots[accountId];
    // Try with "mt5-" prefix (caller may pass raw login "11789976")
    const prefixed = `mt5-${accountId}`;
    if (snapshots[prefixed]) return snapshots[prefixed];
    // Fallback: search by mt5Login or credentials login field
    for (const snap of Object.values(snapshots)) {
      const session = snap.session as any;
      if (session?.mt5Login === accountId) return snap;
      if (session?._credentials?.login === accountId) return snap;
    }
    return null;
  }, [snapshots]);

  /**
   * Connect an account
   */
  const connect = useCallback(async (params: ConnectParams): Promise<{ success: boolean; error?: string }> => {
    if (!apiAvailable) {
      return { success: false, error: 'Desktop API not available' };
    }

    log('Connecting account', params.accountId);
    
    try {
      const result = await connectionSupervisor.connect(params);
      
      if (!result.success) {
        showErrorToast('Connection Failed', result.error || 'Unknown error');
      } else {
        // Reset error count on success
        toastCountRef.current = 0;
        lastToastErrorRef.current = null;
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      showErrorToast('Connection Error', errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [apiAvailable, log, showErrorToast]);

  /**
   * Disconnect an account
   */
  const disconnect = useCallback(async (
    accountId: string, 
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!apiAvailable) {
      return { success: false, error: 'Desktop API not available' };
    }

    log('Disconnecting account', accountId, reason);
    
    try {
      return await connectionSupervisor.disconnect(accountId, reason);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Disconnect failed';
      return { success: false, error: errorMsg };
    }
  }, [apiAvailable, log]);

  /**
   * Archive-disconnect: fully removes session so the health-check won't
   * auto-reconnect. The ZMQ bridge stays alive for re-use by a new account.
   */
  const archiveDisconnect = useCallback(async (
    accountId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!apiAvailable) {
      return { success: false, error: 'Desktop API not available' };
    }

    log('Archive-disconnecting account', accountId, reason);

    try {
      return await connectionSupervisor.archiveDisconnect(accountId, reason);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Archive disconnect failed';
      return { success: false, error: errorMsg };
    }
  }, [apiAvailable, log]);

  /**
   * Refresh a specific account's data
   */
  const refresh = useCallback(async (accountId: string): Promise<void> => {
    if (!apiAvailable) return;

    log('Refreshing account', accountId);
    
    try {
      await connectionSupervisor.refresh(accountId);
    } catch (err) {
      console.error('[useConnectionsFeed] Refresh failed:', err);
    }
  }, [apiAvailable, log]);

  /**
   * Refresh all connected accounts
   */
  const refreshAll = useCallback(async (): Promise<void> => {
    if (!apiAvailable) return;

    log('Refreshing all accounts');
    
    try {
      await connectionSupervisor.refreshAll();
    } catch (err) {
      console.error('[useConnectionsFeed] Refresh all failed:', err);
    }
  }, [apiAvailable, log]);

  /**
   * Manual refresh all accounts from ZMQ cache (no network calls)
   * Used by Refresh button - reads cached data from main process
   */
  const manualRefreshAll = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!apiAvailable) return { success: false, error: 'API not available' };

    log('Manual refresh all from ZMQ cache');
    
    try {
      return await connectionSupervisor.manualRefreshAll();
    } catch (err) {
      console.error('[useConnectionsFeed] Manual refresh all failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Refresh failed' };
    }
  }, [apiAvailable, log]);

  /**
   * Check if an account is connected
   */
  const isConnected = useCallback((accountId: string): boolean => {
    const snapshot = getSnapshot(accountId);
    return snapshot?.session.status === 'connected';
  }, [getSnapshot]);

  /**
   * Get connection status for an account
   */
  const getStatus = useCallback((accountId: string): ConnectionStatus => {
    const snapshot = getSnapshot(accountId);
    return snapshot?.session.status || 'disconnected';
  }, [getSnapshot]);

  return {
    snapshots,
    isLoading,
    error,
    getSnapshot,
    connect,
    disconnect,
    archiveDisconnect,
    refresh,
    refreshAll,
    manualRefreshAll,
    isConnected,
    getStatus,
  };
}

// ============================================================================
// Utility Exports
// ============================================================================

export { buildConnectParams, formatConnectionStatus };

/**
 * Format currency value
 */
export function formatCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage value
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '0.00%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format lot size
 */
export function formatLots(value: number | null | undefined): string {
  if (value == null) return '0.00';
  return value.toFixed(2);
}

/**
 * Format profit/loss with color class
 */
export function formatProfitClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-primary' : 'text-destructive';
}

// Default export
export default useConnectionsFeed;
