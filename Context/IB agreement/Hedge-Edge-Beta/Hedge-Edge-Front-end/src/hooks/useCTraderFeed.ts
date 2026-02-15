/**
 * React Hook for cTrader Account Data
 * ====================================
 * Use this hook to fetch live cTrader data from your local cTrader terminal.
 * 
 * For web builds, returns a graceful "desktop-only" state without errors.
 * Includes retry/backoff when agent is not running and throttled error toasts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  ctrader,
  type TradingCredentials,
  type AccountSnapshot,
  type Position,
  isBridgeAvailable,
} from '@/lib/local-trading-bridge';

// Re-export types with cTrader naming
export type CTraderSnapshot = AccountSnapshot;
export type CTraderPosition = Position;

interface UseCTraderFeedOptions {
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

interface UseCTraderFeedResult {
  snapshot: CTraderSnapshot | null;
  positions: CTraderPosition[];
  balance: number;
  equity: number;
  profit: number;
  isLoading: boolean;
  isConnected: boolean;
  terminalRunning: boolean;
  error: string | null;
  lastUpdate: Date | null;
  /** Whether the IPC bridge is available (desktop only) */
  bridgeAvailable: boolean;
  /** Whether in a recoverable waiting state (agent not running yet) */
  isWaitingForAgent: boolean;
  refresh: () => Promise<void>;
  validate: (credentials: TradingCredentials) => Promise<boolean>;
}

const DEFAULT_OPTIONS: Required<Omit<UseCTraderFeedOptions, 'credentials'>> = {
  pollingInterval: 2000,
  autoStart: true,
  showToasts: true,
  retryInterval: 5000,
  maxToastErrors: 3,
};

/**
 * Custom hook to fetch live cTrader data from local terminal via IPC bridge
 * 
 * For web builds, returns a graceful "desktop-only" state without errors.
 * 
 * @param options - Configuration options
 * @returns cTrader snapshot data, loading state, and error information
 * 
 * @example
 * ```tsx
 * const { snapshot, isLoading, error, isConnected, bridgeAvailable } = useCTraderFeed();
 * 
 * if (!bridgeAvailable) return <DesktopOnlyMessage />;
 * if (isLoading) return <Spinner />;
 * if (error) return <Error message={error} />;
 * 
 * return <div>Balance: ${snapshot?.balance}</div>;
 * ```
 */
export function useCTraderFeed(options?: UseCTraderFeedOptions): UseCTraderFeedResult {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [snapshot, setSnapshot] = useState<CTraderSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Track bridge availability as state
  const [bridgeAvailable] = useState(() => isBridgeAvailable());
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  
  // Toast throttling refs
  const errorCountRef = useRef(0);
  const lastErrorRef = useRef<string | null>(null);
  
  const { toast } = useToast();

  /**
   * Show throttled toast - only shows for first few occurrences
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
    // Graceful handling for web builds
    if (!bridgeAvailable) {
      setIsLoading(false);
      setIsConnected(false);
      setTerminalRunning(false);
      return;
    }

    try {
      // First check terminal status
      const statusResult = await ctrader.getStatus();
      
      if (statusResult.success && statusResult.data) {
        setTerminalRunning(statusResult.data.terminalRunning);
        
        if (!statusResult.data.terminalRunning) {
          setError('cTrader trading agent not running. Please start the local agent.');
          setIsConnected(false);
          setIsWaitingForAgent(true);
          setIsLoading(false);
          return;
        }
      } else {
        setTerminalRunning(false);
        setIsConnected(false);
        setIsWaitingForAgent(true);
        setError('cTrader agent not responding. Please start the local agent.');
        setIsLoading(false);
        return;
      }

      // Fetch snapshot
      const result = await ctrader.getSnapshot(config.credentials);
      
      if (result.success && result.data) {
        setSnapshot(result.data);
        setError(null);
        setIsConnected(true);
        setIsWaitingForAgent(false);
        setLastUpdate(new Date());
        resetErrorCount();
      } else {
        throw new Error(result.error || 'Failed to fetch snapshot');
      }
      
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Error fetching cTrader snapshot:', error);
      const errorMessage = error.message || 'Failed to connect to cTrader';
      setError(errorMessage);
      setIsConnected(false);
      
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
        `cTrader ${isTerminalClosed ? 'Disconnected' : 'Connection Error'}`,
        isTerminalClosed 
          ? 'The cTrader terminal appears to be closed or the cBot was removed.'
          : 'Failed to connect to your local cTrader terminal. Make sure the trading agent is running.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [bridgeAvailable, config.credentials, showThrottledToast, resetErrorCount]);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchLatestSnapshot();
  }, [fetchLatestSnapshot]);

  /**
   * Validate credentials
   */
  const validate = useCallback(async (credentials: TradingCredentials): Promise<boolean> => {
    if (!credentials.login || !credentials.server) {
      return false;
    }

    try {
      const result = await ctrader.validateCredentials(credentials);
      return result.success;
    } catch {
      return false;
    }
  }, []);

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

    // Fetch immediately on mount
    fetchLatestSnapshot();

    // Use longer retry interval when waiting for agent
    const interval = setInterval(
      fetchLatestSnapshot, 
      isWaitingForAgent ? config.retryInterval : config.pollingInterval
    );

    // Cleanup on unmount
    return () => {
      clearInterval(interval);
    };
  }, [bridgeAvailable, config.autoStart, config.pollingInterval, config.retryInterval, isWaitingForAgent, fetchLatestSnapshot]);

  return {
    snapshot,
    positions: snapshot?.positions || [],
    balance: snapshot?.balance || 0,
    equity: snapshot?.equity || 0,
    profit: snapshot?.profit || 0,
    isLoading,
    isConnected,
    terminalRunning,
    error,
    lastUpdate,
    bridgeAvailable,
    isWaitingForAgent,
    refresh,
    validate,
  };
}

/**
 * Hook to check cTrader terminal status
 * Returns bridgeAvailable for graceful web build handling
 */
export function useCTraderStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bridgeAvailable] = useState(() => isBridgeAvailable());

  const checkStatus = useCallback(async () => {
    // Graceful handling for web builds
    if (!bridgeAvailable) {
      setIsConnected(false);
      setTerminalRunning(false);
      // No error - this is expected in web builds
      setIsChecking(false);
      return;
    }

    try {
      setIsChecking(true);
      const result = await ctrader.getStatus();
      
      if (result.success && result.data) {
        setIsConnected(result.data.connected);
        setTerminalRunning(result.data.terminalRunning);
        setError(result.data.error || null);
      } else {
        setIsConnected(false);
        setTerminalRunning(false);
        setError(result.error || 'Failed to check status');
      }
    } catch (err) {
      setIsConnected(false);
      setTerminalRunning(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsChecking(false);
    }
  }, [bridgeAvailable]);

  useEffect(() => {
    checkStatus();
    // Don't poll if bridge not available
    if (!bridgeAvailable) return;
    
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [bridgeAvailable, checkStatus]);

  return { isConnected, terminalRunning, isChecking, error, checkStatus, bridgeAvailable };
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
