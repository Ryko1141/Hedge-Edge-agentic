/**
 * React Hook for Local Trading Feed (MT5/cTrader)
 * ================================================
 * Use this hook to fetch live trading data from your local MT5 or cTrader terminal
 * via the Electron IPC bridge.
 * 
 * For web builds, the hook returns a graceful "desktop-only" state without errors.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  mt5,
  ctrader,
  type TradingPlatform,
  type TradingCredentials,
  type AccountSnapshot,
  type Position,
  type TerminalStatus,
  isBridgeAvailable,
} from '@/lib/local-trading-bridge';

// Re-export types for backwards compatibility
export type { AccountSnapshot as MT5Snapshot, Position as MT5Position };

/**
 * MT5 Order data structure
 */
export interface MT5Order {
  ticket: number;
  symbol: string;
  type: string;
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  time: string;
  magic: number;
  comment: string;
}

/**
 * MT5 Tick data structure
 */
export interface MT5Tick {
  bid: number;
  ask: number;
  last: number;
  volume: number;
  time: string;
}

/**
 * Hook return type
 */
export interface UseTradingFeedReturn {
  snapshot: AccountSnapshot | null;
  positions: Position[];
  balance: number;
  equity: number;
  profit: number;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  terminalRunning: boolean;
  lastUpdate: Date | null;
  /** Whether the IPC bridge is available (desktop only) */
  bridgeAvailable: boolean;
  /** Whether in a recoverable waiting state (agent not running yet) */
  isWaitingForAgent: boolean;
  refresh: () => Promise<void>;
}

/**
 * Configuration options for the hook
 */
export interface UseTradingFeedOptions {
  /** Trading platform to connect to */
  platform?: TradingPlatform;
  /** Optional credentials for multi-account mode */
  credentials?: TradingCredentials;
  /** Polling interval in milliseconds (default: 2000) */
  pollingInterval?: number;
  /** Whether to start polling automatically (default: true) */
  autoStart?: boolean;
  /** Show toast notifications for errors (default: true) */
  showToasts?: boolean;
  /** Retry interval when agent not running, in ms (default: 5000) */
  retryInterval?: number;
  /** Max consecutive errors before stopping toasts (default: 3) */
  maxToastErrors?: number;
}

const DEFAULT_OPTIONS: Required<Omit<UseTradingFeedOptions, 'credentials'>> = {
  platform: 'mt5',
  pollingInterval: 2000,
  autoStart: true,
  showToasts: true,
  retryInterval: 5000,
  maxToastErrors: 3,
};

/**
 * Custom hook to fetch live trading data from local terminal via IPC bridge
 * 
 * For web builds, returns a graceful "desktop-only" state without errors.
 * Includes retry/backoff when agent is not running and throttled error toasts.
 * 
 * @param options - Configuration options
 * @returns Trading snapshot data, loading state, and error information
 * 
 * @example
 * ```tsx
 * const { snapshot, isLoading, error, isConnected, bridgeAvailable } = useTradingFeed({ platform: 'mt5' });
 * 
 * if (!bridgeAvailable) return <DesktopOnlyMessage />;
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error} />;
 * 
 * return <div>Balance: ${snapshot?.balance}</div>;
 * ```
 */
export function useTradingFeed(options?: UseTradingFeedOptions): UseTradingFeedReturn {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const bridge = config.platform === 'ctrader' ? ctrader : mt5;
  
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Track bridge availability as state (constant for lifecycle)
  const [bridgeAvailable] = useState(() => isBridgeAvailable());
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  
  // Track current credentials to detect account changes
  const credentialsKey = config.credentials?.login || '';
  
  // Reset state when account changes (credentials.login changes)
  useEffect(() => {
    // Clear previous account's data immediately when switching accounts
    setSnapshot(null);
    setIsLoading(true);
    setError(null);
    setIsConnected(false);
    setLastUpdate(null);
  }, [credentialsKey]);
  
  // Toast throttling refs
  const errorCountRef = useRef(0);
  const lastErrorRef = useRef<string | null>(null);
  
  const { toast } = useToast();

  /**
   * Show throttled toast - only shows for first few occurrences of same error
   */
  const showThrottledToast = useCallback((title: string, description: string) => {
    if (!config.showToasts) return;
    
    const errorKey = `${title}:${description}`;
    const isNewError = lastErrorRef.current !== errorKey;
    
    if (isNewError) {
      errorCountRef.current = 0;
      lastErrorRef.current = errorKey;
    }
    
    errorCountRef.current++;
    
    // Only show toast for first few occurrences
    if (errorCountRef.current <= config.maxToastErrors) {
      toast({
        title,
        description: errorCountRef.current === config.maxToastErrors 
          ? `${description} (muting further alerts)`
          : description,
        variant: 'destructive',
      });
    }
  }, [config.showToasts, config.maxToastErrors, toast]);

  /**
   * Reset error count on successful connection
   */
  const resetErrorCount = useCallback(() => {
    errorCountRef.current = 0;
    lastErrorRef.current = null;
  }, []);

  /**
   * Fetch latest snapshot via IPC bridge
   */
  const fetchLatestSnapshot = useCallback(async () => {
    // Graceful handling for web builds - no error, just "not available"
    if (!bridgeAvailable) {
      setIsLoading(false);
      setIsConnected(false);
      setTerminalRunning(false);
      // Don't set error - this is expected in web builds
      return;
    }

    try {
      // First check terminal status
      const statusResult = await bridge.getStatus();
      
      if (statusResult.success && statusResult.data) {
        setTerminalRunning(statusResult.data.terminalRunning);
        
        if (!statusResult.data.terminalRunning) {
          setError(`${config.platform.toUpperCase()} trading agent not running. Please start the local agent.`);
          setIsConnected(false);
          setIsWaitingForAgent(true);
          setIsLoading(false);
          return;
        }
      } else {
        // Agent might not be running at all
        setTerminalRunning(false);
        setIsConnected(false);
        setIsWaitingForAgent(true);
        setError(`${config.platform.toUpperCase()} agent not responding. Please start the local agent.`);
        setIsLoading(false);
        return;
      }

      // Fetch snapshot
      const result = await bridge.getSnapshot(config.credentials);
      
      if (result.success && result.data) {
        setSnapshot(result.data);
        setError(null);
        setIsConnected(true);
        setIsWaitingForAgent(false);
        setLastUpdate(new Date());
        resetErrorCount(); // Success - reset toast throttle
      } else {
        throw new Error(result.error || 'Failed to fetch snapshot');
      }
      
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`Error fetching ${config.platform} snapshot:`, error);
      const errorMessage = error.message || `Failed to connect to ${config.platform.toUpperCase()}`;
      setError(errorMessage);
      setIsConnected(false);
      
      // Determine if this is an "agent not running" error for retry interval
      const isAgentError = errorMessage.includes('ECONNREFUSED') || 
                          errorMessage.includes('agent') ||
                          errorMessage.includes('not running') ||
                          errorMessage.includes('not responding') ||
                          errorMessage.includes('terminal') ||
                          errorMessage.includes('closed') ||
                          errorMessage.includes('removed') ||
                          errorMessage.includes('No fresh data');
      setIsWaitingForAgent(isAgentError);
      
      // Customize toast message based on error type
      const isTerminalClosed = errorMessage.includes('terminal') || 
                               errorMessage.includes('closed') || 
                               errorMessage.includes('removed') ||
                               errorMessage.includes('No fresh data');
      
      showThrottledToast(
        `${config.platform.toUpperCase()} ${isTerminalClosed ? 'Disconnected' : 'Connection Error'}`,
        isTerminalClosed 
          ? `The ${config.platform.toUpperCase()} terminal appears to be closed or the EA/cBot was removed.`
          : `Failed to connect to your local ${config.platform.toUpperCase()} terminal. Make sure the trading agent is running.`
      );
    } finally {
      setIsLoading(false);
    }
  }, [bridgeAvailable, bridge, config.platform, config.credentials, showThrottledToast, resetErrorCount]);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchLatestSnapshot();
  }, [fetchLatestSnapshot]);

  /**
   * Set up polling effect with adaptive interval
   */
  useEffect(() => {
    // Don't poll if bridge not available (web build)
    if (!bridgeAvailable) {
      setIsLoading(false);
      return;
    }
    
    if (!config.autoStart) {
      setIsLoading(false);
      return;
    }

    // Fetch immediately on mount or when credentials change
    fetchLatestSnapshot();

    // Use longer retry interval when waiting for agent
    const interval = setInterval(
      fetchLatestSnapshot, 
      isWaitingForAgent ? config.retryInterval : config.pollingInterval
    );

    // Cleanup on unmount or when credentials change
    return () => {
      clearInterval(interval);
    };
  }, [bridgeAvailable, config.autoStart, config.pollingInterval, config.retryInterval, isWaitingForAgent, fetchLatestSnapshot, credentialsKey]);

  return {
    snapshot,
    positions: snapshot?.positions || [],
    balance: snapshot?.balance || 0,
    equity: snapshot?.equity || 0,
    profit: snapshot?.profit || 0,
    isLoading,
    error,
    isConnected,
    terminalRunning,
    lastUpdate,
    bridgeAvailable,
    isWaitingForAgent,
    refresh,
  };
}

/**
 * Hook to check trading terminal status
 * Returns bridgeAvailable for graceful web build handling
 */
export function useTerminalStatus(platform: TradingPlatform = 'mt5') {
  const [status, setStatus] = useState<TerminalStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [bridgeAvailable] = useState(() => isBridgeAvailable());
  const bridge = platform === 'ctrader' ? ctrader : mt5;

  const checkStatus = useCallback(async () => {
    // Graceful handling for web builds
    if (!bridgeAvailable) {
      setStatus({
        connected: false,
        platform,
        terminalRunning: false,
        // No error - this is expected in web builds
      });
      setIsChecking(false);
      return;
    }

    try {
      setIsChecking(true);
      const result = await bridge.getStatus();
      if (result.success && result.data) {
        setStatus(result.data);
      } else {
        setStatus({
          connected: false,
          platform,
          terminalRunning: false,
          error: result.error,
        });
      }
    } catch (err) {
      setStatus({
        connected: false,
        platform,
        terminalRunning: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsChecking(false);
    }
  }, [bridgeAvailable, bridge, platform]);

  useEffect(() => {
    checkStatus();
    // Don't poll if bridge not available
    if (!bridgeAvailable) return;
    
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [bridgeAvailable, checkStatus]);

  return { 
    status, 
    isChecking, 
    checkStatus,
    isConnected: status?.connected || false,
    terminalRunning: status?.terminalRunning || false,
    bridgeAvailable,
  };
}

/**
 * Utility function to format currency values
 */
export function formatCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (value == null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Utility function to format percentage values
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '0.00%';
  return `${value.toFixed(2)}%`;
}

/**
 * Utility function to format lot sizes
 */
export function formatLots(value: number | null | undefined): string {
  if (value == null) return '0.00';
  return value.toFixed(2);
}

/**
 * Utility function to format price with appropriate decimals
 */
export function formatPrice(value: number | null | undefined, decimals = 5): string {
  if (value == null) return '0.00000';
  return value.toFixed(decimals);
}

// ============================================================================
// Backwards Compatibility Aliases
// ============================================================================

/**
 * @deprecated Use useTradingFeed({ platform: 'mt5' }) instead
 */
export function useMT5LiveFeed(
  accountId?: string | null,
  options?: Omit<UseTradingFeedOptions, 'platform'>
): UseTradingFeedReturn & { refresh: () => Promise<void> } {
  return useTradingFeed({ ...options, platform: 'mt5' });
}

/**
 * @deprecated Use useTerminalStatus('mt5') instead
 */
export function useVPSHealth() {
  const { status, isChecking, checkStatus, isConnected, terminalRunning } = useTerminalStatus('mt5');
  
  return {
    isHealthy: terminalRunning,
    mt5Connected: isConnected,
    isChecking,
    checkHealth: checkStatus,
  };
}
