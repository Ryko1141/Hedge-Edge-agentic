/**
 * Local Trading Bridge
 * ====================
 * IPC-based bridge for communicating with local MT5/cTrader terminals via Electron.
 * This replaces the VPS HTTP client with secure IPC calls that keep all 
 * HTTP/CORS concerns out of the renderer process.
 * 
 * All trading data flows:
 * Renderer -> IPC -> Main Process -> Local Terminal/Agent -> Main Process -> IPC -> Renderer
 */

import { isElectron } from './desktop';

// ============================================================================
// Types
// ============================================================================

export type TradingPlatform = 'mt5' | 'ctrader';

export interface TradingCredentials {
  login: string;
  password: string;
  server: string;
}

export interface AccountInfo {
  login: number;
  name: string;
  broker: string;
  server: string;
  currency: string;
  balance: number;
  equity: number;
  leverage: number;
}

export interface Position {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  price_open: number;
  price_current: number;
  profit: number;
  swap: number;
  commission: number;
  sl: number;
  tp: number;
  time: string;
  magic: number;
  comment: string;
}

export interface Order {
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

export interface AccountSnapshot {
  login: number;
  server: string;
  name: string;
  broker: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  margin_level: number;
  profit: number;
  leverage: number;
  positions: Position[];
  positions_count: number;
  orders: Order[];
  orders_count: number;
  timestamp: string;
}

export interface BalanceInfo {
  login: number;
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  profit: number;
  positions_count: number;
  timestamp: string;
}

export interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  time: string;
}

export interface OrderRequest {
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  magic?: number;
  comment?: string;
}

export interface CloseOrderRequest {
  ticket: number;
  volume?: number; // Partial close if specified
}

export interface OrderResult {
  success: boolean;
  ticket?: number;
  error?: string;
}

export interface TerminalStatus {
  connected: boolean;
  platform: TradingPlatform;
  terminalRunning: boolean;
  lastHeartbeat?: string;
  error?: string;
}

export interface BridgeResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Bridge Implementation
// ============================================================================

/**
 * Check if the local trading bridge is available
 */
export function isBridgeAvailable(): boolean {
  return isElectron() && typeof window.electronAPI?.trading !== 'undefined';
}

/**
 * Get terminal connection status
 */
export async function getTerminalStatus(platform: TradingPlatform): Promise<BridgeResult<TerminalStatus>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available - running outside Electron or bridge not initialized',
    };
  }

  try {
    return await window.electronAPI!.trading.getStatus(platform);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get terminal status',
    };
  }
}

/**
 * Validate trading credentials
 */
export async function validateCredentials(
  platform: TradingPlatform,
  credentials: TradingCredentials
): Promise<BridgeResult<AccountInfo>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.validateCredentials(platform, credentials);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate credentials',
    };
  }
}

/**
 * Get full account snapshot
 */
export async function getSnapshot(
  platform: TradingPlatform,
  credentials?: TradingCredentials
): Promise<BridgeResult<AccountSnapshot>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.getSnapshot(platform, credentials);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get snapshot',
    };
  }
}

/**
 * Get balance info (lightweight, for frequent polling)
 */
export async function getBalance(
  platform: TradingPlatform,
  credentials?: TradingCredentials
): Promise<BridgeResult<BalanceInfo>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.getBalance(platform, credentials);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get balance',
    };
  }
}

/**
 * Get open positions
 */
export async function getPositions(
  platform: TradingPlatform,
  credentials?: TradingCredentials
): Promise<BridgeResult<Position[]>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.getPositions(platform, credentials);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get positions',
    };
  }
}

/**
 * Get symbol tick data
 */
export async function getTick(
  platform: TradingPlatform,
  symbol: string
): Promise<BridgeResult<TickData>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.getTick(platform, symbol);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tick',
    };
  }
}

/**
 * Get available symbols
 */
export async function getSymbols(platform: TradingPlatform): Promise<BridgeResult<string[]>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.getSymbols(platform);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get symbols',
    };
  }
}

/**
 * Place a new order
 */
export async function placeOrder(
  platform: TradingPlatform,
  order: OrderRequest,
  credentials?: TradingCredentials
): Promise<BridgeResult<OrderResult>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.placeOrder(platform, order, credentials);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to place order',
    };
  }
}

/**
 * Close an existing order/position
 */
export async function closeOrder(
  platform: TradingPlatform,
  request: CloseOrderRequest,
  credentials?: TradingCredentials
): Promise<BridgeResult<OrderResult>> {
  if (!isBridgeAvailable()) {
    return {
      success: false,
      error: 'Trading bridge not available',
    };
  }

  try {
    return await window.electronAPI!.trading.closeOrder(platform, request, credentials);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close order',
    };
  }
}

// ============================================================================
// Platform-Specific Convenience Wrappers
// ============================================================================

/**
 * MT5-specific bridge functions
 */
export const mt5 = {
  getStatus: () => getTerminalStatus('mt5'),
  validateCredentials: (creds: TradingCredentials) => validateCredentials('mt5', creds),
  getSnapshot: (creds?: TradingCredentials) => getSnapshot('mt5', creds),
  getBalance: (creds?: TradingCredentials) => getBalance('mt5', creds),
  getPositions: (creds?: TradingCredentials) => getPositions('mt5', creds),
  getTick: (symbol: string) => getTick('mt5', symbol),
  getSymbols: () => getSymbols('mt5'),
  placeOrder: (order: OrderRequest, creds?: TradingCredentials) => placeOrder('mt5', order, creds),
  closeOrder: (request: CloseOrderRequest, creds?: TradingCredentials) => closeOrder('mt5', request, creds),
};

/**
 * cTrader-specific bridge functions
 */
export const ctrader = {
  getStatus: () => getTerminalStatus('ctrader'),
  validateCredentials: (creds: TradingCredentials) => validateCredentials('ctrader', creds),
  getSnapshot: (creds?: TradingCredentials) => getSnapshot('ctrader', creds),
  getBalance: (creds?: TradingCredentials) => getBalance('ctrader', creds),
  getPositions: (creds?: TradingCredentials) => getPositions('ctrader', creds),
  getTick: (symbol: string) => getTick('ctrader', symbol),
  getSymbols: () => getSymbols('ctrader'),
  placeOrder: (order: OrderRequest, creds?: TradingCredentials) => placeOrder('ctrader', order, creds),
  closeOrder: (request: CloseOrderRequest, creds?: TradingCredentials) => closeOrder('ctrader', request, creds),
};
