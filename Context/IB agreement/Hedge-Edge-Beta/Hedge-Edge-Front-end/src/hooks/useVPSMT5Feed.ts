/**
 * VPS MT5 Feed Hook (Backwards Compatibility)
 * ============================================
 * This file re-exports from the new unified useTradingFeed hook
 * for backwards compatibility with existing code.
 * 
 * @deprecated Import from '@/hooks/useTradingFeed' directly
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  useTradingFeed,
  useTerminalStatus,
  type UseTradingFeedOptions,
  type UseTradingFeedReturn,
} from './useTradingFeed';
import type {
  TradingCredentials,
  AccountSnapshot,
  Position,
} from '@/lib/local-trading-bridge';

// Re-export types for backwards compatibility
export type MT5Snapshot = AccountSnapshot;
export type MT5Position = Position;

interface UseVPSMT5FeedOptions {
  login: string;
  password: string;
  server: string;
  enabled?: boolean;
  pollInterval?: number;
  fullSnapshot?: boolean;
}

interface UseVPSMT5FeedResult {
  snapshot: AccountSnapshot | null;
  positions: Position[];
  balance: number;
  equity: number;
  profit: number;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: () => Promise<void>;
  validate: () => Promise<boolean>;
}

/**
 * @deprecated Use useTradingFeed from '@/hooks/useTradingFeed' instead
 */
export function useVPSMT5Feed({
  login,
  password,
  server,
  enabled = true,
  pollInterval = 5000,
  fullSnapshot = true,
}: UseVPSMT5FeedOptions): UseVPSMT5FeedResult {
  // Always pass credentials if login is provided, even without password
  // This allows the backend to match the correct account by login ID
  const credentials: TradingCredentials | undefined = 
    login && server 
      ? { login, password: password || '', server } 
      : undefined;

  const feed = useTradingFeed({
    platform: 'mt5',
    credentials,
    pollingInterval: pollInterval,
    autoStart: enabled,
  });

  // Add validate function for backwards compatibility
  const validate = useCallback(async (): Promise<boolean> => {
    if (!login || !password || !server) {
      return false;
    }

    try {
      const { mt5 } = await import('@/lib/local-trading-bridge');
      const result = await mt5.validateCredentials({ login, password, server });
      return result.success;
    } catch {
      return false;
    }
  }, [login, password, server]);

  return {
    ...feed,
    validate,
  };
}

/**
 * @deprecated Use useTerminalStatus from '@/hooks/useTradingFeed' instead
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
