/**
 * TypeScript type declarations for HedgeEdge desktop application
 * 
 * This is a desktop-only (Electron) application. These types define
 * the IPC bridge between renderer and main process.
 * 
 * NOTE: Canonical trading types are defined in src/lib/local-trading-bridge.ts
 * This file only provides ambient declarations for window.electronAPI
 */

// Vite environment variables (desktop build)
interface ImportMetaEnv {
  // Supabase is optional for cloud sync/auth
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Re-declare minimal types for ambient window interface
// (Full types with documentation are in local-trading-bridge.ts)
type TradingPlatform = 'mt5' | 'ctrader';
type AgentMode = 'bundled' | 'external' | 'not-configured';
type AgentStatus = 'stopped' | 'starting' | 'running' | 'connected' | 'error' | 'not-available';

// Agent Health Status
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

// Agent Configuration Summary
interface AgentConfigSummary {
  mt5: { mode: AgentMode; endpoint: string; hasBundled: boolean };
  ctrader: { mode: AgentMode; endpoint: string; hasBundled: boolean };
}

// Agent Configuration Update
interface AgentConfigUpdate {
  mode?: AgentMode;
  host?: string;
  port?: number;
}

// Trading Credentials
interface TradingCredentials {
  login: string;
  password: string;
  server: string;
}

// Order Request
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

// Close Order Request
interface CloseOrderRequest {
  ticket: number;
  volume?: number;
}

// Generic Bridge Result
interface BridgeResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Terminal Detection Types
type TerminalType = 'mt4' | 'mt5' | 'ctrader';

interface DetectedTerminal {
  id: string;
  type: TerminalType;
  name: string;
  executablePath: string;
  installPath: string;
  terminalId?: string;
  broker?: string;
  isRunning?: boolean;
  dataPath?: string;
}

interface DetectionResult {
  success: boolean;
  terminals: DetectedTerminal[];
  error?: string;
  deepScan?: boolean;
}

interface LaunchCredentials {
  login?: string;
  password?: string;
  server?: string;
}

interface TerminalsAPI {
  detect: (forceRefresh?: boolean) => Promise<DetectionResult>;
  detectDeep: () => Promise<DetectionResult>;
  launch: (executablePath: string, credentials?: LaunchCredentials) => Promise<{ success: boolean; error?: string }>;
}

// Trading API exposed via Electron preload
interface TradingAPI {
  getStatus: (platform: TradingPlatform) => Promise<BridgeResult>;
  validateCredentials: (platform: TradingPlatform, credentials: TradingCredentials) => Promise<BridgeResult>;
  getSnapshot: (platform: TradingPlatform, credentials?: TradingCredentials) => Promise<BridgeResult>;
  getBalance: (platform: TradingPlatform, credentials?: TradingCredentials) => Promise<BridgeResult>;
  getPositions: (platform: TradingPlatform, credentials?: TradingCredentials) => Promise<BridgeResult>;
  getTick: (platform: TradingPlatform, symbol: string) => Promise<BridgeResult>;
  getSymbols: (platform: TradingPlatform) => Promise<BridgeResult>;
  placeOrder: (platform: TradingPlatform, order: OrderRequest, credentials?: TradingCredentials) => Promise<BridgeResult>;
  closeOrder: (platform: TradingPlatform, request: CloseOrderRequest, credentials?: TradingCredentials) => Promise<BridgeResult>;
}

// Agent Management API exposed via Electron preload
interface AgentAPI {
  getConfig: () => Promise<AgentConfigSummary>;
  getHealthStatus: () => Promise<{ mt5: AgentHealthStatus; ctrader: AgentHealthStatus }>;
  getPlatformHealth: (platform: TradingPlatform) => Promise<{ success: boolean; data?: AgentHealthStatus; error?: string }>;
  setConfig: (platform: TradingPlatform, config: AgentConfigUpdate) => Promise<{ success: boolean; error?: string }>;
  resetConfig: (platform: TradingPlatform) => Promise<{ success: boolean; error?: string }>;
  start: (platform: TradingPlatform) => Promise<{ success: boolean; error?: string }>;
  stop: (platform: TradingPlatform) => Promise<{ success: boolean; error?: string }>;
  restart: (platform: TradingPlatform) => Promise<{ success: boolean; error?: string }>;
  getLogPath: (platform: TradingPlatform) => Promise<{ success: boolean; data?: string; error?: string }>;
  hasBundled: (platform: TradingPlatform) => Promise<{ success: boolean; data?: boolean; error?: string }>;
  getConnectedAccounts: () => Promise<{ success: boolean; data?: Array<{
    login: string;
    server: string;
    name?: string;
    broker?: string;
    balance?: number;
    equity?: number;
    currency?: string;
    leverage?: number;
  }>; error?: string }>;
  onStatusChange: (
    callback: (status: { mt5: AgentHealthStatus; ctrader: AgentHealthStatus }) => void,
    intervalMs?: number
  ) => () => void;
}

// Secure Storage API for encrypted credential storage
interface SecureStorageResult {
  success: boolean;
  data?: string;
  error?: string;
}

interface SecureStorageAPI {
  isAvailable: () => Promise<boolean>;
  encrypt: (plainText: string) => Promise<SecureStorageResult>;
  decrypt: (encryptedBase64: string) => Promise<SecureStorageResult>;
}

// Password Cache API — encrypted blobs stored in main-process filesystem
interface PasswordCacheAPI {
  store: (login: string, encryptedBase64: string, server: string) => Promise<{ success: boolean; error?: string }>;
  retrieve: (login: string, server: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  remove: (login: string, server: string) => Promise<{ success: boolean; error?: string }>;
  clear: () => Promise<{ success: boolean; error?: string }>;
}

// MT5 Cluster IPC API — credentials stay in main process
interface MT5ClusterAPI {
  connect: (args: { baseUrl: string; userId: string; login: number; password: string; server: string; apiToken?: string }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  disconnect: (args: { baseUrl: string; userId: string; apiToken?: string }) => Promise<{ success: boolean; error?: string }>;
}

// Connection Management Types (mirrors src/types/connections.ts)
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

interface ConnectionsAPI {
  list: () => Promise<ConnectionSnapshotMap>;
  connect: (params: ConnectParams) => Promise<{ success: boolean; error?: string }>;
  disconnect: (params: DisconnectParams) => Promise<{ success: boolean; error?: string }>;
  archiveDisconnect: (params: DisconnectParams) => Promise<{ success: boolean; error?: string }>;
  status: (accountId: string) => Promise<ConnectionSnapshot | null>;
  refresh: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  reconnect: () => Promise<{ reconnected: number; failed: number }>;
  manualRefreshAll: () => Promise<{ success: boolean; error?: string }>;
  refreshFromEA: () => Promise<{ found: number; reconnected: number }>;
  onSnapshotUpdate: (
    callback: (snapshots: ConnectionSnapshotMap) => void,
    intervalMs?: number
  ) => () => void;
}

// License Management API
interface LicenseStatusData {
  valid?: boolean;
  status?: 'valid' | 'invalid' | 'expired' | 'not-configured' | 'checking' | 'error';
  maskedKey?: string;
  expiresAt?: string;
  tier?: string;
  plan?: string;
  lastChecked?: string;
  nextCheckAt?: string;
  daysRemaining?: number;
  features?: string[];
  email?: string;
  errorMessage?: string;
  secureStorage?: boolean;
  deviceId?: string;
  devices?: LicenseDeviceInfo[];
  connectedAgents?: number;
}

interface LicenseDeviceInfo {
  deviceId: string;
  platform: 'desktop' | 'mt5' | 'mt4' | 'ctrader';
  name?: string;
  registeredAt: string;
  lastSeenAt: string;
  version?: string;
  isCurrentDevice: boolean;
}

interface LicenseConnectedAgent {
  id: string;
  platform: 'mt5' | 'mt4' | 'ctrader';
  accountId: string;
  connectedAt: string;
  lastHeartbeat: string;
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

interface LicenseAPI {
  getStatus: () => Promise<{ success: boolean; data?: LicenseStatusData; error?: string }>;
  validate: (licenseKey: string, deviceId?: string, platform?: string) => Promise<{ success: boolean; data?: LicenseValidationResult; error?: string }>;
  activate: (licenseKey: string) => Promise<{ success: boolean; license?: LicenseStatusData; error?: string }>;
  refresh: () => Promise<{ success: boolean; license?: LicenseStatusData; error?: string }>;
  remove: () => Promise<{ success: boolean; error?: string }>;
  getKey: () => Promise<{ success: boolean; data?: string; error?: string }>;
  isSecureStorageAvailable: () => Promise<{ success: boolean; data?: boolean }>;
  getDevices: () => Promise<{ success: boolean; data?: LicenseDeviceInfo[]; error?: string }>;
  deactivateDevice: (deviceId: string) => Promise<{ success: boolean; error?: string }>;
  getDeviceId: () => Promise<{ success: boolean; data?: string }>;
  getConnectedAgents: () => Promise<{ success: boolean; data?: LicenseConnectedAgent[] }>;
  onStatusChange: (callback: (status: LicenseStatusData) => void, intervalMs?: number) => () => void;
}

// WebRequest Proxy API
interface ProxyStatus {
  running: boolean;
  port: number;
  requestsServed: number;
  cacheHits: number;
  cacheMisses: number;
  uptime?: number;
}

interface ProxyAPI {
  start: () => Promise<{ success: boolean; data?: ProxyStatus; error?: string }>;
  stop: () => Promise<{ success: boolean; error?: string }>;
  getStatus: () => Promise<{ success: boolean; data?: ProxyStatus }>;
}

// Installer API for EA/DLL installation
interface InstallerAPI {
  precheck: (terminalId: string) => Promise<{ 
    success: boolean; 
    data?: { 
      passed: boolean; 
      checks: { 
        terminalInstalled: boolean;
        terminalClosed: boolean;
        dataFolderWritable: boolean;
        assetsAvailable: boolean;
      }; 
      messages: string[]; 
    }; 
    error?: string; 
  }>;
  installAsset: (terminalId: string, assetType: string) => Promise<{ 
    success: boolean; 
    data?: { 
      installedPath: string; 
      verified?: boolean; 
      hash?: string; 
    }; 
    error?: string; 
  }>;
  openDataFolder: (terminalId: string) => Promise<{ success: boolean; error?: string }>;
  selectPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
  installToPath: (assetType: string, targetPath: string) => Promise<{ 
    success: boolean; 
    data?: { 
      installedPath: string; 
      verified?: boolean; 
      hash?: string; 
    }; 
    error?: string; 
  }>;
}

// MT5 WebRequest Whitelist API
interface MT5WhitelistAPI {
  check: (terminalDataPath: string) => Promise<{ 
    success: boolean; 
    data?: { 
      whitelisted: boolean; 
      currentUrls: string[]; 
    }; 
    error?: string; 
  }>;
  add: (terminalDataPath: string) => Promise<{ success: boolean; error?: string }>;
  getInstructions: () => Promise<{ 
    success: boolean; 
    data?: { 
      steps: string[]; 
      url: string; 
    }; 
    error?: string; 
  }>;
}

// Agent Data Channel API
interface AgentSnapshot {
  accountId?: string;
  licenseStatus?: string;
  positions?: Array<{
    ticket: number;
    symbol: string;
    type: string;
    volume: number;
    profit: number;
  }>;
  lastUpdate?: string;
}

interface AgentChannelAPI {
  readSnapshot: (platform: TradingPlatform) => Promise<{ 
    success: boolean; 
    data?: AgentSnapshot; 
    error?: string; 
  }>;
  sendCommand: (platform: TradingPlatform, command: string, params?: Record<string, unknown>) => Promise<{ 
    success: boolean; 
    data?: unknown; 
    error?: string; 
  }>;
}

// ─── Trade Copier API ───────────────────────────────────────────────────────

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

interface CopierEventPayload {
  type: 'statsUpdate' | 'activity' | 'copyError';
  data: unknown;
}

interface CopierFollowerStatsData {
  tradesToday: number;
  tradesTotal: number;
  totalProfit: number;
  avgLatency: number;
  successRate: number;
  failedCopies: number;
  lastCopyTime: string | null;
}

interface CopierGroupStatsData {
  groupId: string;
  tradesToday: number;
  tradesTotal: number;
  totalProfit: number;
  avgLatency: number;
  activeFollowers: number;
  totalFollowers: number;
  followers: Record<string, CopierFollowerStatsData>;
}

interface CopierActivityData {
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
}

interface CopierAPI {
  updateGroups: (groups: CopierGroupConfig[]) => Promise<{ success: boolean; error?: string }>;
  updateAccountMap: (mapping: Record<string, string>) => Promise<{ success: boolean; error?: string }>;
  setGlobalEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  getGroupStats: (groupId: string) => Promise<{ success: boolean; data?: CopierGroupStatsData; error?: string }>;
  getActivityLog: (limit?: number) => Promise<{ success: boolean; data?: CopierActivityData[]; error?: string }>;
  resetCircuitBreaker: (groupId: string, followerId: string) => Promise<{ success: boolean; error?: string }>;
  isGlobalEnabled: () => Promise<{ success: boolean; data?: boolean; error?: string }>;
  getHedgePnLByLeader: () => Promise<{ success: boolean; data?: Record<string, number>; error?: string }>;
  onCopierEvent: (callback: (event: CopierEventPayload) => void) => () => void;
}

// ─── Daily Limit API ───────────────────────────────────────────────────────

interface DailyLimitResult {
  dailyStartBalance: number;
  currentEquity: number;
  dailyLimitAmount: number;
  dailyLimitPercent: number;
  usedAmount: number;
  remainingAmount: number;
  isEODTriggered: boolean;
  serverDay: string;
  lastUpdate: number;
}

interface DailyAccountState {
  dailyStartBalance: number;
  currentEquity: number;
  currentBalance: number;
  serverDay: string;
  serverTimeUnix: number;
  highWaterMark: number;
  lastUpdate: number;
}

interface DailyLimitAPI {
  calculate: (accountId: string, dailyLimitPercent: number) => Promise<{ success: boolean; data?: DailyLimitResult; error?: string }>;
  getState: (accountId: string) => Promise<{ success: boolean; data?: DailyAccountState; error?: string }>;
  reset: (accountId: string) => Promise<{ success: boolean; error?: string }>;
  getAllAccounts: () => Promise<{ success: boolean; data?: Record<string, DailyAccountState>; error?: string }>;
}

// Electron API exposed via preload script
interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{
    platform: string;
    arch: string;
    isPackaged: boolean;
  }>;
  openExternal: (url: string) => Promise<boolean>;
  isElectron: boolean;
  trading: TradingAPI;
  agent: AgentAPI;
  terminals: TerminalsAPI;
  secureStorage: SecureStorageAPI;
  passwordCache: PasswordCacheAPI;
  mt5Cluster: MT5ClusterAPI;
  connections: ConnectionsAPI;
  license: LicenseAPI;
  proxy: ProxyAPI;
  installer: InstallerAPI;
  mt5Whitelist: MT5WhitelistAPI;
  agentChannel: AgentChannelAPI;
  copier: CopierAPI;
  dailyLimit: DailyLimitAPI;
}

// Extend Window interface for Electron
interface Window {
  electronAPI?: ElectronAPI;
}
