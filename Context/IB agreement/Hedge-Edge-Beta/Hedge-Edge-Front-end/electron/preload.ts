/**
 * Preload script for secure IPC communication between main and renderer processes.
 * This script runs in a sandboxed context with access to some Node.js APIs
 * but exposes only safe, validated functions to the renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';

// ============================================================================
// Types for Trading Bridge IPC
// ============================================================================

type TradingPlatform = 'mt5' | 'ctrader';
type AgentMode = 'bundled' | 'external' | 'not-configured';
type AgentStatus = 'stopped' | 'starting' | 'running' | 'connected' | 'error' | 'not-available';

interface TradingCredentials {
  login: string;
  password: string;
  server: string;
}

interface OrderRequest {
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  magic?: number;
  comment?: string;
}

interface CloseOrderRequest {
  ticket: number;
  volume?: number;
}

interface AgentConfigUpdate {
  mode?: AgentMode;
  host?: string;
  port?: number;
}

interface AgentHealthStatus {
  platform: TradingPlatform;
  status: AgentStatus;
  port: number;
  pid: number | null;
  uptime: number | null;
  restartCount: number;
  lastError: string | null;
  isBundled: boolean;
  isExternal: boolean;
}

interface AgentConfigSummary {
  mt5: { mode: AgentMode; endpoint: string; hasBundled: boolean };
  ctrader: { mode: AgentMode; endpoint: string; hasBundled: boolean };
}

// ============================================================================
// Types for Terminal Detection
// ============================================================================

type TerminalType = 'mt4' | 'mt5' | 'ctrader';

interface DetectedTerminal {
  id: string;
  type: TerminalType;
  name: string;
  executablePath: string;
  installPath: string;
  broker?: string;
  version?: string;
  isRunning?: boolean;
}

interface DetectionResult {
  success: boolean;
  terminals: DetectedTerminal[];
  error?: string;
}

// ============================================================================
// Helper to sanitize objects for IPC (prevent DataCloneError)
// ============================================================================

function sanitizeForIPC<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  // Use JSON round-trip to ensure plain serializable object
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function sanitizeCredentials(credentials?: TradingCredentials): TradingCredentials | undefined {
  if (!credentials) return undefined;
  return {
    login: String(credentials.login || ''),
    password: String(credentials.password || ''),
    server: String(credentials.server || ''),
  };
}

// ============================================================================
// Trading Bridge API
// ============================================================================

const tradingAPI = {
  /**
   * Get terminal connection status
   */
  getStatus: async (platform: TradingPlatform): Promise<any> => {
    try {
      return await ipcRenderer.invoke('trading:getStatus', String(platform));
    } catch (err) {
      console.error('[Preload] getStatus error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Validate trading credentials
   */
  validateCredentials: async (platform: TradingPlatform, credentials: TradingCredentials): Promise<any> => {
    // Basic validation before sending
    if (!credentials.login || !credentials.server) {
      return { success: false, error: 'Login and server are required' };
    }
    try {
      return await ipcRenderer.invoke('trading:validateCredentials', String(platform), sanitizeCredentials(credentials));
    } catch (err) {
      console.error('[Preload] validateCredentials error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Get full account snapshot
   */
  getSnapshot: async (platform: TradingPlatform, credentials?: TradingCredentials): Promise<any> => {
    try {
      return await ipcRenderer.invoke('trading:getSnapshot', String(platform), sanitizeCredentials(credentials));
    } catch (err) {
      console.error('[Preload] getSnapshot error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Get balance info (lightweight)
   */
  getBalance: async (platform: TradingPlatform, credentials?: TradingCredentials): Promise<any> => {
    try {
      return await ipcRenderer.invoke('trading:getBalance', String(platform), sanitizeCredentials(credentials));
    } catch (err) {
      console.error('[Preload] getBalance error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Get open positions
   */
  getPositions: (platform: TradingPlatform, credentials?: TradingCredentials): Promise<any> => {
    return ipcRenderer.invoke('trading:getPositions', String(platform), sanitizeCredentials(credentials));
  },

  /**
   * Get symbol tick data
   */
  getTick: (platform: TradingPlatform, symbol: string): Promise<any> => {
    if (!symbol || typeof symbol !== 'string') {
      return Promise.resolve({ success: false, error: 'Valid symbol required' });
    }
    return ipcRenderer.invoke('trading:getTick', String(platform), String(symbol));
  },

  /**
   * Get available symbols
   */
  getSymbols: (platform: TradingPlatform): Promise<any> => {
    return ipcRenderer.invoke('trading:getSymbols', String(platform));
  },

  /**
   * Place a new order
   */
  placeOrder: (platform: TradingPlatform, order: OrderRequest, credentials?: TradingCredentials): Promise<any> => {
    // Validate order basics
    if (!order.symbol || !order.type || !order.volume) {
      return Promise.resolve({ success: false, error: 'Symbol, type, and volume are required' });
    }
    if (!['BUY', 'SELL'].includes(order.type)) {
      return Promise.resolve({ success: false, error: 'Order type must be BUY or SELL' });
    }
    if (order.volume <= 0) {
      return Promise.resolve({ success: false, error: 'Volume must be positive' });
    }
    return ipcRenderer.invoke('trading:placeOrder', String(platform), sanitizeForIPC(order), sanitizeCredentials(credentials));
  },

  /**
   * Close an existing order/position
   */
  closeOrder: (platform: TradingPlatform, request: CloseOrderRequest, credentials?: TradingCredentials): Promise<any> => {
    if (!request.ticket || request.ticket <= 0) {
      return Promise.resolve({ success: false, error: 'Valid ticket number required' });
    }
    return ipcRenderer.invoke('trading:closeOrder', String(platform), sanitizeForIPC(request), sanitizeCredentials(credentials));
  },
  
  // -------------------------------------------------------------------------
  // Event-Driven Trading Feed (Real-time Events)
  // -------------------------------------------------------------------------
  
  /**
   * Subscribe to trading events for a terminal
   * Returns immediately - events are pushed via the onEvent listener
   */
  subscribeEvents: (terminalId: string): Promise<any> => {
    return ipcRenderer.invoke('trading:subscribeEvents', terminalId);
  },
  
  /**
   * Get cached account state (use instead of polling getSnapshot)
   */
  getCachedState: (terminalId: string): Promise<any> => {
    return ipcRenderer.invoke('trading:getCachedState', terminalId);
  },
  
  /**
   * Listen for trading events (position opened/closed, heartbeat, etc.)
   * Returns an unsubscribe function
   * 
   * Event types:
   * - positionOpened: New position was opened
   * - positionClosed: Position was closed
   * - positionModified: Position SL/TP was modified
   * - positionReversed: Position was reversed
   * - orderPlaced: New pending order placed
   * - orderCancelled: Pending order cancelled
   * - connected: Terminal connected
   * - disconnected: Terminal disconnected
   * - heartbeat: Periodic keepalive with basic metrics
   * - priceUpdate: Symbol price changed (if enabled)
   * - paused: Trading paused
   * - resumed: Trading resumed
   * - event: Generic event (all events)
   * - error: Error occurred
   */
  onEvent: (callback: (eventData: {
    event: string;
    terminalId: string;
    data: unknown;
    timestamp: string;
  }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, eventData: unknown) => {
      try {
        callback(eventData as { event: string; terminalId: string; data: unknown; timestamp: string });
      } catch (err) {
        console.error('[Preload] Error in trading event handler:', err);
      }
    };
    
    ipcRenderer.on('trading:event', handler);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('trading:event', handler);
    };
  },

  /**
   * Request trade history from a specific connected terminal.
   * The deals will be forwarded via the onEvent listener as a 'tradeHistory' event.
   * @param terminalId The MT5 login / terminal ID
   * @param days Number of days of history to fetch (default 30)
   */
  getHistory: async (terminalId: string, days: number = 3650): Promise<any> => {
    try {
      return await ipcRenderer.invoke('trading:getHistory', String(terminalId), days);
    } catch (err) {
      console.error('[Preload] getHistory error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Request trade history from ALL connected terminals.
   * The deals will be forwarded via the onEvent listener as 'tradeHistory' events.
   */
  getHistoryAll: async (): Promise<any> => {
    try {
      return await ipcRenderer.invoke('trading:getHistoryAll');
    } catch (err) {
      console.error('[Preload] getHistoryAll error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ============================================================================
// Agent Management API
// ============================================================================

const agentAPI = {
  /**
   * Get configuration summary for all agents
   */
  getConfig: (): Promise<AgentConfigSummary> => {
    return ipcRenderer.invoke('agent:getConfig');
  },

  /**
   * Get health status for all agents
   */
  getHealthStatus: (): Promise<{ mt5: AgentHealthStatus; ctrader: AgentHealthStatus }> => {
    return ipcRenderer.invoke('agent:getHealthStatus');
  },

  /**
   * Get health status for a specific platform
   */
  getPlatformHealth: (platform: TradingPlatform): Promise<{ success: boolean; data?: AgentHealthStatus; error?: string }> => {
    return ipcRenderer.invoke('agent:getPlatformHealth', platform);
  },

  /**
   * Update agent configuration for a platform
   */
  setConfig: (platform: TradingPlatform, config: AgentConfigUpdate): Promise<{ success: boolean; error?: string }> => {
    // Basic validation before sending
    if (config.port !== undefined && (config.port < 1 || config.port > 65535)) {
      return Promise.resolve({ success: false, error: 'Port must be between 1 and 65535' });
    }
    return ipcRenderer.invoke('agent:setConfig', platform, config);
  },

  /**
   * Reset agent configuration to defaults
   */
  resetConfig: (platform: TradingPlatform): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:resetConfig', platform);
  },

  /**
   * Start an agent (bundled mode only)
   */
  start: (platform: TradingPlatform): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:start', platform);
  },

  /**
   * Stop an agent
   */
  stop: (platform: TradingPlatform): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:stop', platform);
  },

  /**
   * Restart an agent
   */
  restart: (platform: TradingPlatform): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:restart', platform);
  },

  /**
   * Get agent log file path
   */
  getLogPath: (platform: TradingPlatform): Promise<{ success: boolean; data?: string; error?: string }> => {
    return ipcRenderer.invoke('agent:getLogPath', platform);
  },

  /**
   * Check if bundled agent exists for a platform
   */
  hasBundled: (platform: TradingPlatform): Promise<{ success: boolean; data?: boolean; error?: string }> => {
    return ipcRenderer.invoke('agent:hasBundled', platform);
  },

  /**
   * Get list of accounts connected via EA/cBot
   */
  getConnectedAccounts: (): Promise<{ success: boolean; data?: Array<{
    login: string;
    server: string;
    name?: string;
    broker?: string;
    balance?: number;
    equity?: number;
    currency?: string;
    leverage?: number;
  }>; error?: string }> => {
    return ipcRenderer.invoke('agent:getConnectedAccounts');
  },

  /**
   * Get EA control channel (liveness gate) states
   */
  getControlChannels: (): Promise<{ success: boolean; data?: Array<{
    terminalId: string;
    controlPort: number;
    status: 'binding' | 'bound' | 'connected' | 'error' | 'closed';
    lastEnableSent?: string;
    error?: string;
  }> }> => {
    return ipcRenderer.invoke('agent:getControlChannels');
  },

  /**
   * Subscribe to agent status changes (polling-based for simplicity)
   * Returns an unsubscribe function
   */
  onStatusChange: (callback: (status: { mt5: AgentHealthStatus; ctrader: AgentHealthStatus }) => void, intervalMs = 5000): () => void => {
    let active = true;
    
    const poll = async () => {
      if (!active) return;
      
      try {
        const status = await ipcRenderer.invoke('agent:getHealthStatus');
        if (active) {
          callback(status);
        }
      } catch (error) {
        console.error('Failed to get agent status:', error);
      }
      
      if (active) {
        setTimeout(poll, intervalMs);
      }
    };
    
    // Start polling
    poll();
    
    // Return unsubscribe function
    return () => {
      active = false;
    };
  },
};

// ============================================================================
// Terminal Detection API
// ============================================================================

const terminalsAPI = {
  /**
   * Detect installed trading terminals (MT4/MT5/cTrader) - fast scan
   * @param forceRefresh - If true, bypass 30s cache and do a fresh scan
   */
  detect: (forceRefresh?: boolean): Promise<DetectionResult> => {
    return ipcRenderer.invoke('terminals:detect', forceRefresh === true);
  },

  /**
   * Deep scan for terminals (SLOW - scans entire system)
   */
  detectDeep: (): Promise<DetectionResult> => {
    return ipcRenderer.invoke('terminals:detectDeep');
  },

  /**
   * Launch a terminal by executable path, optionally with credentials
   */
  launch: (
    executablePath: string, 
    credentials?: { login?: string; password?: string; server?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!executablePath || typeof executablePath !== 'string') {
      return Promise.resolve({ success: false, error: 'Invalid executable path' });
    }
    return ipcRenderer.invoke('terminals:launch', executablePath, credentials);
  },
};

// ============================================================================
// Secure Storage API (encrypted credential storage)
// ============================================================================

interface SecureStorageResult {
  success: boolean;
  data?: string;
  error?: string;
}

// ============================================================================
// Connection Management Types
// ============================================================================

type ConnectionPlatform = 'mt5' | 'ctrader';
type ConnectionRole = 'local' | 'vps' | 'cloud';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface ConnectionEndpoint {
  host: string;
  port: number;
  secure?: boolean;
}

interface ConnectionMetrics {
  balance: number;
  equity: number;
  profit: number;
  positionCount: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
}

interface ConnectionPosition {
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime: string;
  magic?: number;
  comment?: string;
}

interface ConnectionSession {
  id: string;
  accountId: string;
  platform: ConnectionPlatform;
  role: ConnectionRole;
  endpoint?: ConnectionEndpoint;
  status: ConnectionStatus;
  lastUpdate: string;
  lastConnected?: string;
  error?: string;
  reconnectAttempts?: number;
  autoReconnect?: boolean;
}

interface ConnectionSnapshot {
  session: ConnectionSession;
  metrics?: ConnectionMetrics;
  positions?: ConnectionPosition[];
  timestamp: string;
}

type ConnectionSnapshotMap = Record<string, ConnectionSnapshot>;

interface ConnectParams {
  accountId: string;
  platform: ConnectionPlatform;
  role: ConnectionRole;
  credentials: {
    login: string;
    password: string;
    server: string;
  };
  endpoint?: ConnectionEndpoint;
  autoReconnect?: boolean;
}

interface DisconnectParams {
  accountId: string;
  reason?: string;
}

// ============================================================================
// Connection Management API
// ============================================================================

const connectionsAPI = {
  /**
   * List all connection snapshots
   */
  list: async (): Promise<ConnectionSnapshotMap> => {
    try {
      return await ipcRenderer.invoke('connections:list');
    } catch (err) {
      console.error('[Preload] connections:list error:', err);
      return {};
    }
  },

  /**
   * Connect an account
   */
  connect: async (params: ConnectParams): Promise<{ success: boolean; error?: string }> => {
    // Validate required fields
    if (!params.accountId || !params.credentials?.login || !params.credentials?.server) {
      return { success: false, error: 'Account ID, login, and server are required' };
    }
    try {
      return await ipcRenderer.invoke('connections:connect', params);
    } catch (err) {
      console.error('[Preload] connections:connect error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Disconnect an account
   */
  disconnect: async (params: DisconnectParams): Promise<{ success: boolean; error?: string }> => {
    if (!params.accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    try {
      return await ipcRenderer.invoke('connections:disconnect', params);
    } catch (err) {
      console.error('[Preload] connections:disconnect error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Archive-disconnect: fully removes the session so the health-check
   * won't auto-reconnect. The ZMQ bridge stays alive for re-use.
   */
  archiveDisconnect: async (params: DisconnectParams): Promise<{ success: boolean; error?: string }> => {
    if (!params.accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    try {
      return await ipcRenderer.invoke('connections:archiveDisconnect', params);
    } catch (err) {
      console.error('[Preload] connections:archiveDisconnect error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Get status for a specific account
   */
  status: async (accountId: string): Promise<ConnectionSnapshot | null> => {
    if (!accountId) {
      return null;
    }
    try {
      return await ipcRenderer.invoke('connections:status', accountId);
    } catch (err) {
      console.error('[Preload] connections:status error:', err);
      return null;
    }
  },

  /**
   * Refresh connection data for an account
   */
  refresh: async (accountId: string): Promise<{ success: boolean; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    try {
      return await ipcRenderer.invoke('connections:refresh', accountId);
    } catch (err) {
      console.error('[Preload] connections:refresh error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Scan for running EAs and reconnect all available accounts
   * Useful for restoring connections after app restart
   */
  reconnect: async (): Promise<{ success: boolean; sessionsCount?: number; connectedCount?: number; error?: string }> => {
    try {
      return await ipcRenderer.invoke('connections:reconnect');
    } catch (err) {
      console.error('[Preload] connections:reconnect error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Manual refresh all accounts from cached ZMQ data
   * Reads from the local ZMQ cache (no network calls) and pushes fresh snapshots to renderer
   * Use this for the "Refresh" button in the dashboard
   */
  manualRefreshAll: async (): Promise<{ success: boolean; error?: string }> => {
    try {
      return await ipcRenderer.invoke('connections:manualRefreshAll');
    } catch (err) {
      console.error('[Preload] connections:manualRefreshAll error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Refresh connection data for an account by re-reading EA file
   * More thorough than refresh() - re-scans terminal files
   */
  refreshFromEA: async (accountId: string): Promise<{ success: boolean; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    try {
      return await ipcRenderer.invoke('connections:refreshFromEA', accountId);
    } catch (err) {
      console.error('[Preload] connections:refreshFromEA error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Subscribe to connection updates (EVENT-DRIVEN - NO POLLING)
   * Returns an unsubscribe function
   * 
   * Updates are pushed from main process via 'connections:update' events
   * when ZeroMQ receives data from EAs
   */
  onSnapshotUpdate: (
    callback: (snapshots: ConnectionSnapshotMap) => void,
    _intervalMs = 3000 // Ignored - kept for backwards compatibility
  ): (() => void) => {
    // Get initial state once
    ipcRenderer.invoke('connections:list').then((snapshots) => {
      callback(snapshots);
    }).catch((error) => {
      console.error('Failed to get initial connection state:', error);
    });

    // Listen for updates pushed from main process (event-driven)
    const handler = (_event: Electron.IpcRendererEvent, snapshots: ConnectionSnapshotMap) => {
      callback(snapshots);
    };
    
    ipcRenderer.on('connections:update', handler);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener('connections:update', handler);
    };
  },
};

const secureStorageAPI = {
  /**
   * Check if secure storage (OS keychain encryption) is available
   */
  isAvailable: (): Promise<boolean> => {
    return ipcRenderer.invoke('secureStorage:isAvailable');
  },

  /**
   * Encrypt a string using OS keychain (Windows DPAPI, macOS Keychain, Linux Secret Service)
   * @param plainText - The plain text to encrypt
   * @returns Encrypted data as base64 string
   */
  encrypt: (plainText: string): Promise<SecureStorageResult> => {
    return ipcRenderer.invoke('secureStorage:encrypt', plainText);
  },

  /**
   * Decrypt a string previously encrypted with safeStorage
   * @param encryptedBase64 - The base64-encoded encrypted data
   * @returns Decrypted plain text
   */
  decrypt: (encryptedBase64: string): Promise<SecureStorageResult> => {
    return ipcRenderer.invoke('secureStorage:decrypt', encryptedBase64);
  },
};

// ============================================================================
// Password Cache API (encrypted blobs stored in main-process filesystem)
// ============================================================================

const passwordCacheAPI = {
  /** Store an encrypted password blob for an account */
  store: (login: string, encryptedBase64: string, server: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('passwordCache:store', login, encryptedBase64, server);
  },
  /** Retrieve an encrypted password blob (null if not found or expired) */
  retrieve: (login: string, server: string): Promise<{ success: boolean; data?: string | null; error?: string }> => {
    return ipcRenderer.invoke('passwordCache:retrieve', login, server);
  },
  /** Remove a single cached entry */
  remove: (login: string, server: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('passwordCache:remove', login, server);
  },
  /** Clear all cached passwords */
  clear: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('passwordCache:clear');
  },
};

// ============================================================================
// MT5 Cluster IPC API (credentials stay in main process)
// ============================================================================

const mt5ClusterAPI = {
  connect: (args: { baseUrl: string; userId: string; login: number; password: string; server: string; apiToken?: string }) =>
    ipcRenderer.invoke('mt5Cluster:connect', args),
  disconnect: (args: { baseUrl: string; userId: string; apiToken?: string }) =>
    ipcRenderer.invoke('mt5Cluster:disconnect', args),
};

// ============================================================================
// License Management Types
// ============================================================================

type LicenseStatus = 'valid' | 'expired' | 'invalid' | 'not-configured' | 'checking' | 'error';

interface LicenseInfo {
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
  devices?: DeviceInfo[];
  connectedAgents?: number;
  secureStorage?: boolean;
}

interface LicenseResult {
  success: boolean;
  license?: LicenseInfo;
  error?: string;
}

interface LicenseValidationResult {
  valid: boolean;
  token?: string;
  ttlSeconds?: number;
  message?: string;
  plan?: string;
  tier?: string;
  expiresAt?: string;
  features?: string[];
  email?: string;
  maxDevices?: number;
  currentDevices?: number;
}

interface DeviceInfo {
  deviceId: string;
  platform: 'desktop' | 'mt5' | 'mt4' | 'ctrader';
  name?: string;
  registeredAt: string;
  lastSeenAt: string;
  version?: string;
  isCurrentDevice: boolean;
}

interface ConnectedAgent {
  id: string;
  platform: 'mt5' | 'mt4' | 'ctrader';
  accountId: string;
  connectedAt: string;
  lastHeartbeat: string;
}

interface ProxyStatus {
  running: boolean;
  port: number;
  requestsServed: number;
  cacheHits: number;
  cacheMisses: number;
  uptime?: number;
}

// ============================================================================
// Installer Types
// ============================================================================

type InstallableAssetType = 'mt4-ea' | 'mt5-ea' | 'mt4-dll' | 'mt5-dll' | 'ctrader-cbot';

interface InstallationPrecheck {
  passed: boolean;
  checks: {
    terminalInstalled: boolean;
    terminalClosed: boolean;
    dataFolderWritable: boolean;
    assetsAvailable: boolean;
  };
  messages: string[];
}

interface AssetInstallResult {
  success: boolean;
  data?: { installedPath: string };
  error?: string;
}

interface AssetsAvailability {
  mt4: { ea: boolean; dll: boolean };
  mt5: { ea: boolean; dll: boolean };
  ctrader: { cbot: boolean };
}

// ============================================================================
// License Management API (Enhanced)
// ============================================================================

const licenseAPI = {
  /**
   * Get current license status with enhanced device and agent info
   */
  getStatus: (): Promise<{ success: boolean; data?: LicenseInfo; error?: string }> => {
    return ipcRenderer.invoke('license:getStatus');
  },

  /**
   * Validate a license key directly (doesn't necessarily activate)
   * @param licenseKey - The license key to validate
   * @param deviceId - Optional device ID (uses current device if not provided)
   * @param platform - Optional platform identifier
   */
  validate: (licenseKey: string, deviceId?: string, platform?: string): Promise<{ success: boolean; data?: LicenseValidationResult; error?: string }> => {
    if (!licenseKey || typeof licenseKey !== 'string') {
      return Promise.resolve({ success: false, error: 'License key is required' });
    }
    return ipcRenderer.invoke('license:validate', licenseKey, deviceId, platform);
  },

  /**
   * Activate a license key (validates and stores it)
   * @param licenseKey - The license key to validate and activate
   */
  activate: (licenseKey: string): Promise<LicenseResult> => {
    if (!licenseKey || typeof licenseKey !== 'string') {
      return Promise.resolve({ success: false, error: 'License key is required' });
    }
    return ipcRenderer.invoke('license:activate', licenseKey);
  },

  /**
   * Refresh the current license status
   */
  refresh: (): Promise<LicenseResult> => {
    return ipcRenderer.invoke('license:refresh');
  },

  /**
   * Remove the current license
   */
  remove: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('license:remove');
  },

  /**
   * Get the actual license key (for copy/display purposes)
   */
  getKey: (): Promise<{ success: boolean; data?: string; error?: string }> => {
    return ipcRenderer.invoke('license:getKey');
  },

  /**
   * Check if secure storage (OS keychain) is available
   */
  isSecureStorageAvailable: (): Promise<{ success: boolean; data?: boolean }> => {
    return ipcRenderer.invoke('license:isSecureStorageAvailable');
  },

  /**
   * Get registered devices for the current license
   */
  getDevices: (): Promise<{ success: boolean; data?: DeviceInfo[]; error?: string }> => {
    return ipcRenderer.invoke('license:devices');
  },

  /**
   * Deactivate a device from the license
   * @param deviceId - The ID of the device to deactivate
   */
  deactivateDevice: (deviceId: string): Promise<{ success: boolean; error?: string }> => {
    if (!deviceId || typeof deviceId !== 'string') {
      return Promise.resolve({ success: false, error: 'Device ID is required' });
    }
    return ipcRenderer.invoke('license:deactivate', deviceId);
  },

  /**
   * Get current device ID
   */
  getDeviceId: (): Promise<{ success: boolean; data?: string }> => {
    return ipcRenderer.invoke('license:getDeviceId');
  },

  /**
   * Get list of connected agents/terminals
   */
  getConnectedAgents: (): Promise<{ success: boolean; data?: ConnectedAgent[] }> => {
    return ipcRenderer.invoke('license:getConnectedAgents');
  },

  /**
   * Subscribe to license status changes (polling-based)
   * Returns an unsubscribe function
   */
  onStatusChange: (
    callback: (status: LicenseInfo) => void,
    intervalMs = 60000 // Check every minute
  ): (() => void) => {
    let active = true;

    const poll = async () => {
      if (!active) return;

      try {
        const result = await ipcRenderer.invoke('license:getStatus');
        if (active && result.success && result.data) {
          callback(result.data);
        }
      } catch (error) {
        console.error('Failed to get license status:', error);
      }

      if (active) {
        setTimeout(poll, intervalMs);
      }
    };

    // Start polling
    poll();

    // Return unsubscribe function
    return () => {
      active = false;
    };
  },
};

// ============================================================================
// WebRequest Proxy API
// ============================================================================

const proxyAPI = {
  /**
   * Start the WebRequest proxy server
   */
  start: (): Promise<{ success: boolean; data?: ProxyStatus; error?: string }> => {
    return ipcRenderer.invoke('proxy:start');
  },

  /**
   * Stop the WebRequest proxy server
   */
  stop: (): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('proxy:stop');
  },

  /**
   * Get proxy server status
   */
  getStatus: (): Promise<{ success: boolean; data?: ProxyStatus }> => {
    return ipcRenderer.invoke('proxy:status');
  },
};

// ============================================================================
// Installer API
// ============================================================================

const installerAPI = {
  /**
   * Run installation prechecks for a terminal
   * @param terminalId - The ID of the terminal to check
   */
  precheck: (terminalId: string): Promise<{ success: boolean; data?: InstallationPrecheck; error?: string }> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    return ipcRenderer.invoke('installer:precheck', terminalId);
  },

  /**
   * Install a single asset to a terminal
   * @param terminalId - The ID of the target terminal
   * @param assetType - The type of asset to install
   */
  installAsset: (terminalId: string, assetType: InstallableAssetType): Promise<AssetInstallResult> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    if (!assetType || typeof assetType !== 'string') {
      return Promise.resolve({ success: false, error: 'Asset type is required' });
    }
    return ipcRenderer.invoke('installer:installAsset', terminalId, assetType);
  },

  /**
   * Select a custom installation path via folder picker
   * @param terminalType - The type of terminal (mt4, mt5, ctrader)
   */
  selectPath: (terminalType: string): Promise<{ 
    success: boolean; 
    data?: { path: string; isValidStructure: boolean }; 
    error?: string 
  }> => {
    return ipcRenderer.invoke('installer:selectPath', terminalType);
  },

  /**
   * Install asset to a custom path
   * @param customPath - The custom data folder path
   * @param assetType - The type of asset to install
   */
  installToPath: (customPath: string, assetType: InstallableAssetType): Promise<AssetInstallResult> => {
    if (!customPath || typeof customPath !== 'string') {
      return Promise.resolve({ success: false, error: 'Custom path is required' });
    }
    if (!assetType || typeof assetType !== 'string') {
      return Promise.resolve({ success: false, error: 'Asset type is required' });
    }
    return ipcRenderer.invoke('installer:installToPath', customPath, assetType);
  },

  /**
   * Open the data folder for a terminal in the file explorer
   * @param terminalId - The ID of the terminal
   */
  openDataFolder: (terminalId: string): Promise<{ success: boolean; error?: string }> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    return ipcRenderer.invoke('installer:openDataFolder', terminalId);
  },

  /**
   * Get information about available installation assets
   */
  getAssets: (): Promise<{ success: boolean; data?: AssetsAvailability; error?: string }> => {
    return ipcRenderer.invoke('installer:getAssets');
  },
};

// ============================================================================
// MT5 WebRequest Whitelist API
// ============================================================================

interface WebRequestWhitelistStatus {
  success: boolean;
  isWhitelisted: boolean;
  currentWhitelist: string[];
  error?: string;
  configPath?: string;
}

const mt5WhitelistAPI = {
  /**
   * Check if Hedge Edge API URL is in WebRequest whitelist
   * @param terminalId - The ID of the MT5 terminal
   */
  checkWhitelist: (terminalId: string): Promise<{ success: boolean; data?: WebRequestWhitelistStatus; error?: string }> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    return ipcRenderer.invoke('mt5:checkWhitelist', terminalId);
  },

  /**
   * Add Hedge Edge API URL to WebRequest whitelist
   * @param terminalId - The ID of the MT5 terminal
   */
  addToWhitelist: (terminalId: string): Promise<{ success: boolean; restartRequired?: boolean; error?: string }> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    return ipcRenderer.invoke('mt5:addToWhitelist', terminalId);
  },

  /**
   * Get manual whitelist instructions
   */
  getInstructions: (): Promise<{ 
    success: boolean; 
    data?: { url: string; instructions: string[] }; 
    error?: string 
  }> => {
    return ipcRenderer.invoke('mt5:getWhitelistInstructions');
  },
};

// ============================================================================
// Agent Data Channel API
// ============================================================================

interface AgentSnapshot {
  timestamp: string;
  platform: 'MT5' | 'cTrader';
  accountId: string;
  broker: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPnL: number;
  currency: string;
  leverage: number;
  status: string;
  isLicenseValid: boolean;
  isPaused: boolean;
  lastError: string | null;
  positions: unknown[];
}

interface AgentCommand {
  action: 'PAUSE' | 'RESUME' | 'CLOSE_ALL' | 'CLOSE_POSITION' | 'STATUS';
  params?: Record<string, string | number>;
}

const agentChannelAPI = {
  /**
   * Read agent snapshot from data channel
   * @param terminalId - The ID of the terminal
   */
  readSnapshot: (terminalId: string): Promise<{ 
    success: boolean; 
    data?: AgentSnapshot; 
    error?: string;
    lastModified?: string;
  }> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    return ipcRenderer.invoke('agent:readSnapshot', terminalId);
  },

  /**
   * Send command to agent
   * @param terminalId - The ID of the terminal
   * @param command - The command to send
   */
  sendCommand: (terminalId: string, command: AgentCommand): Promise<{ 
    success: boolean; 
    response?: unknown; 
    error?: string 
  }> => {
    if (!terminalId || typeof terminalId !== 'string') {
      return Promise.resolve({ success: false, error: 'Terminal ID is required' });
    }
    if (!command || typeof command !== 'object') {
      return Promise.resolve({ success: false, error: 'Command is required' });
    }
    return ipcRenderer.invoke('agent:sendCommand', terminalId, command);
  },
};

// ============================================================================
// Trade Copier API
// ============================================================================

interface CopierGroupConfig {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  leaderAccountId: string;
  leaderAccountName: string;
  leaderPlatform: string;
  leaderPhase: string;
  leaderSymbolSuffixRemove: string;
  leaderBaselinePnL?: number;
  followers: Array<{
    id: string;
    accountId: string;
    accountName: string;
    platform: string;
    phase: string;
    status: string;
    volumeSizing: string;
    lotMultiplier: number;
    reverseMode: boolean;
    symbolWhitelist: string[];
    symbolBlacklist: string[];
    symbolSuffix: string;
    symbolAliases: Array<{ masterSymbol: string; slaveSymbol: string; lotMultiplier?: number }>;
  }>;
}

const copierAPI = {
  /**
   * Update copier groups configuration
   * Sends the full group list to the copier engine in main process
   */
  updateGroups: (groups: CopierGroupConfig[]): Promise<{ success: boolean; error?: string }> => {
    if (!Array.isArray(groups)) {
      return Promise.resolve({ success: false, error: 'Groups must be an array' });
    }
    return ipcRenderer.invoke('copier:updateGroups', groups);
  },

  /**
   * Update account UUID → terminal ID mapping.
   * Maps Supabase account UUIDs to MT5 login numbers so the copier engine
   * can find the correct ZMQ terminal for each account.
   * @param mapping - Record<supabaseUUID, mt5Login>
   */
  updateAccountMap: (mapping: Record<string, string>): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('copier:updateAccountMap', mapping);
  },

  /**
   * Enable or disable the global copier
   */
  setGlobalEnabled: (enabled: boolean): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('copier:setGlobalEnabled', enabled);
  },

  /**
   * Get current stats for a copier group
   */
  getGroupStats: (groupId: string): Promise<{
    success: boolean;
    data?: {
      groupId: string;
      tradesToday: number;
      tradesTotal: number;
      totalProfit: number;
      avgLatency: number;
      activeFollowers: number;
      totalFollowers: number;
      followers: Record<string, {
        tradesToday: number;
        tradesTotal: number;
        totalProfit: number;
        avgLatency: number;
        successRate: number;
        failedCopies: number;
        lastCopyTime: string | null;
      }>;
    };
    error?: string;
  }> => {
    if (!groupId || typeof groupId !== 'string') {
      return Promise.resolve({ success: false, error: 'Group ID is required' });
    }
    return ipcRenderer.invoke('copier:getGroupStats', groupId);
  },

  /**
   * Get recent copier activity log entries
   */
  getActivityLog: (limit?: number): Promise<{
    success: boolean;
    data?: Array<{
      id: string;
      groupId: string;
      followerId: string;
      timestamp: string;
      type: string;
      symbol: string;
      action: string;
      volume: number;
      price: number;
      latency: number;
      status: string;
      errorMessage?: string;
    }>;
    error?: string;
  }> => {
    return ipcRenderer.invoke('copier:getActivityLog', limit ?? 100);
  },

  /**
   * Reset circuit breaker for a follower that hit the error threshold
   */
  resetCircuitBreaker: (groupId: string, followerId: string): Promise<{ success: boolean; error?: string }> => {
    if (!groupId || !followerId) {
      return Promise.resolve({ success: false, error: 'Group ID and Follower ID are required' });
    }
    return ipcRenderer.invoke('copier:resetCircuitBreaker', groupId, followerId);
  },

  /**
   * Get the current global enabled state
   */
  isGlobalEnabled: (): Promise<{ success: boolean; data?: boolean; error?: string }> => {
    return ipcRenderer.invoke('copier:isGlobalEnabled');
  },

  /**
   * Get hedge P/L attributed to each leader (prop) account.
   * Returns Record<leaderAccountId, totalHedgeProfit> from successfully copied trades only.
   */
  getHedgePnLByLeader: (): Promise<{ success: boolean; data?: Record<string, number>; error?: string }> => {
    return ipcRenderer.invoke('copier:getHedgePnLByLeader');
  },

  /**
   * Get internal copier debug state (correlations, groups, account map)
   */
  getDebugState: (): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> => {
    return ipcRenderer.invoke('copier:getDebugState');
  },

  /**
   * Subscribe to real-time copier events (stats, activity, errors)
   * Returns an unsubscribe function
   */
  onCopierEvent: (callback: (event: {
    type: 'statsUpdate' | 'activity' | 'copyError';
    data: unknown;
  }) => void): () => void => {
    const handler = (_event: unknown, payload: {
      type: 'statsUpdate' | 'activity' | 'copyError';
      data: unknown;
    }) => {
      callback(payload);
    };
    ipcRenderer.on('copier:event', handler);
    return () => {
      ipcRenderer.removeListener('copier:event', handler);
    };
  },
};

// ============================================================================
// Daily Limit Tracking API (EOD-based dynamic daily limits)
// ============================================================================

interface DailyLimitResult {
  /** The balance used as reference for daily limit calculation */
  referenceBalance: number;
  /** Daily limit as absolute value (negative = max loss allowed) */
  dailyLimitPnL: number;
  /** Daily limit as percentage */
  dailyLimitPercent: number;
  /** Current day's P&L relative to day-start */
  currentDayPnL: number;
  /** Current day's P&L as percentage of day-start balance */
  currentDayPnLPercent: number;
  /** Remaining daily drawdown before hitting limit */
  remainingDailyDrawdown: number;
  /** Whether daily limit has been breached */
  isLimitBreached: boolean;
  /** The date used for this calculation (broker time) */
  tradingDate: string;
}

interface DailyAccountState {
  accountId: string;
  dayStartBalance: number;
  dayStartEquity: number;
  dayStartDate: string;
  lastEodTimestamp: number;
  crossoverHighWaterMark: number | null;
  hadPositionAtCrossover: boolean;
}

const dailyLimitAPI = {
  /**
   * Calculate daily limit for an account based on broker server EOD
   * Uses the current day's starting balance instead of initial account size
   * 
   * @param accountId - The terminal ID or account ID
   * @param maxDailyLossPercent - The max daily loss percentage (e.g., 5 for 5%)
   */
  calculate: async (
    accountId: string, 
    maxDailyLossPercent: number
  ): Promise<{ success: boolean; data?: DailyLimitResult; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    if (typeof maxDailyLossPercent !== 'number' || maxDailyLossPercent <= 0) {
      return { success: false, error: 'maxDailyLossPercent must be a positive number' };
    }
    try {
      return await ipcRenderer.invoke('dailyLimit:calculate', {
        accountId,
        maxDailyLossPercent,
      });
    } catch (err) {
      console.error('[Preload] dailyLimit:calculate error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Get day-start state for an account
   */
  getState: async (accountId: string): Promise<{ success: boolean; data?: DailyAccountState; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    try {
      return await ipcRenderer.invoke('dailyLimit:getState', accountId);
    } catch (err) {
      console.error('[Preload] dailyLimit:getState error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Manually reset day-start balance (e.g., after deposit/withdrawal)
   */
  reset: async (accountId: string): Promise<{ success: boolean; error?: string }> => {
    if (!accountId) {
      return { success: false, error: 'Account ID is required' };
    }
    try {
      return await ipcRenderer.invoke('dailyLimit:reset', accountId);
    } catch (err) {
      console.error('[Preload] dailyLimit:reset error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Get all tracked account IDs
   */
  getAllAccounts: async (): Promise<{ success: boolean; data?: string[]; error?: string }> => {
    try {
      return await ipcRenderer.invoke('dailyLimit:getAllAccounts');
    } catch (err) {
      console.error('[Preload] dailyLimit:getAllAccounts error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ============================================================================
// Core App API
// ============================================================================

const electronAPI = {
  /**
   * Get the application version
   */
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke('app:getVersion');
  },

  /**
   * Get platform information
   */
  getPlatform: (): Promise<{
    platform: string;
    arch: string;
    isPackaged: boolean;
  }> => {
    return ipcRenderer.invoke('app:getPlatform');
  },

  /**
   * Open an external URL in the default browser
   * @param url - The URL to open (must be http or https)
   */
  openExternal: (url: string): Promise<boolean> => {
    // Validate URL before sending to main process
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        console.warn('Invalid protocol for openExternal:', parsedUrl.protocol);
        return Promise.resolve(false);
      }
    } catch {
      console.warn('Invalid URL for openExternal:', url);
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke('app:openExternal', url);
  },

  /**
   * Check if running in Electron desktop environment
   */
  isElectron: true,

  /**
   * Trading bridge for MT5/cTrader operations via IPC
   */
  trading: tradingAPI,

  /**
   * Agent management for controlling bundled/external agents
   */
  agent: agentAPI,

  /**
   * Terminal detection for finding installed MT4/MT5/cTrader terminals
   */
  terminals: terminalsAPI,

  /**
   * Secure storage for encrypted credential handling via OS keychain
   */
  secureStorage: secureStorageAPI,

  /**
   * Password cache — encrypted blobs stored in main-process filesystem
   */
  passwordCache: passwordCacheAPI,

  /**
   * MT5 cluster operations — credentials stay in main process
   */
  mt5Cluster: mt5ClusterAPI,

  /**
   * Connection management for multi-account session tracking
   */
  connections: connectionsAPI,

  /**
   * License management for subscription validation (enhanced)
   */
  license: licenseAPI,

  /**
   * WebRequest proxy management for MT5 license validation
   */
  proxy: proxyAPI,

  /**
   * Installer for deploying EA/DLL/cBot assets to terminals
   */
  installer: installerAPI,

  /**
   * MT5 WebRequest whitelist management
   */
  mt5Whitelist: mt5WhitelistAPI,

  /**
   * Agent data channel for reading EA/cBot snapshots
   */
  agentChannel: agentChannelAPI,

  /**
   * Trade copier engine for leader→follower copy management
   */
  copier: copierAPI,

  /**
   * Daily limit tracking for EOD-based dynamic daily loss limits
   */
  dailyLimit: dailyLimitAPI,

  /**
   * Security event logging — flush events to main process (FIX-11)
   */
  security: {
    logEvents: (events: any[]) => ipcRenderer.invoke('security:logEvents', events),
  },

  /**
   * Auto-updater controls (FIX-15)
   */
  updater: {
    checkForUpdate: () => ipcRenderer.invoke('update:check'),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    getVersion: () => ipcRenderer.invoke('update:getVersion'),
    onUpdateAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on('update:available', (_event, info) => callback(info));
    },
    onDownloadProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('update:progress', (_event, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback: (info: any) => void) => {
      ipcRenderer.on('update:downloaded', (_event, info) => callback(info));
    },
  },

  /**
   * MetaAPI cloud provisioning — proxied through main process (token never in renderer)
   */
  metaapi: {
    listAccounts: () => ipcRenderer.invoke('metaapi:listAccounts'),
    findAccountByLogin: (login: string, server: string) =>
      ipcRenderer.invoke('metaapi:findAccountByLogin', login, server),
    createAccount: (data: {
      name: string; login: string; password: string;
      server: string; platform: string; type?: string; magic?: number;
    }) => ipcRenderer.invoke('metaapi:createAccount', data),
    deployAccount: (id: string) => ipcRenderer.invoke('metaapi:deployAccount', id),
    getAccountState: (id: string) => ipcRenderer.invoke('metaapi:getAccountState', id),
    getAccountInfo: (id: string) => ipcRenderer.invoke('metaapi:getAccountInfo', id),
    getPositions: (id: string) => ipcRenderer.invoke('metaapi:getPositions', id),
    getOrders: (id: string) => ipcRenderer.invoke('metaapi:getOrders', id),
    getAccountSnapshot: (id: string) => ipcRenderer.invoke('metaapi:getAccountSnapshot', id),
    removeAccount: (id: string) => ipcRenderer.invoke('metaapi:removeAccount', id),
    provisionAccount: (data: {
      name: string; login: string; password: string;
      server: string; platform: string; type?: string; magic?: number;
    }) => ipcRenderer.invoke('metaapi:provisionAccount', data),
    isConfigured: () => ipcRenderer.invoke('metaapi:isConfigured'),
  },
};

// Expose the API to the renderer process via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Type declaration for TypeScript
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
