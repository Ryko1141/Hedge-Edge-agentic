/**
 * Connection Model Types for HedgeEdge
 * =====================================
 * Maps Hedge Edge accounts to connection sessions (role, port/endpoint, status, last update)
 * without altering existing trading logic.
 * 
 * These types define the connection management layer that sits between the UI
 * and the existing MT5/cTrader trading bridges.
 */

// ============================================================================
// Core Connection Types
// ============================================================================

/**
 * Supported trading platforms
 */
export type ConnectionPlatform = 'mt5' | 'ctrader';

/**
 * Connection role - determines how the account connects
 */
export type ConnectionRole = 
  | 'local'      // Local terminal via bundled/external agent
  | 'vps'        // Remote VPS connection
  | 'cloud';     // Cloud-based connection (MetaAPI, etc.)

/**
 * Connection session status
 */
export type ConnectionStatus = 
  | 'disconnected'    // Not connected
  | 'connecting'      // Connection in progress
  | 'connected'       // Successfully connected
  | 'error'           // Connection failed
  | 'reconnecting';   // Attempting to reconnect after failure

/**
 * Connection endpoint configuration
 */
export interface ConnectionEndpoint {
  /** Host address (IP or hostname) */
  host: string;
  /** Port number */
  port: number;
  /** Whether this is a secure connection */
  secure?: boolean;
}

/**
 * Trading metrics snapshot from a connection
 */
export interface ConnectionMetrics {
  /** Account balance */
  balance: number;
  /** Account equity */
  equity: number;
  /** Current profit/loss */
  profit: number;
  /** Number of open positions */
  positionCount: number;
  /** Margin used */
  margin?: number;
  /** Free margin */
  freeMargin?: number;
  /** Margin level percentage */
  marginLevel?: number;
}

/**
 * Position data from a connection
 */
export interface ConnectionPosition {
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

/**
 * Connection session - represents an active or inactive connection to a trading account
 */
export interface ConnectionSession {
  /** Unique session ID (matches account ID) */
  id: string;
  
  /** Account ID this session belongs to */
  accountId: string;
  
  /** Trading platform */
  platform: ConnectionPlatform;
  
  /** Connection role */
  role: ConnectionRole;
  
  /** Connection endpoint (for local/vps roles) */
  endpoint?: ConnectionEndpoint;
  
  /** Current connection status */
  status: ConnectionStatus;
  
  /** Last status update timestamp (ISO string) */
  lastUpdate: string;
  
  /** Last successful connection timestamp (ISO string) */
  lastConnected?: string;
  
  /** Error message if status is 'error' */
  error?: string;
  
  /** Number of reconnection attempts */
  reconnectAttempts?: number;
  
  /** Whether auto-reconnect is enabled */
  autoReconnect?: boolean;
  
  /** License status for this connection */
  licenseStatus?: LicenseStatus;
  
  /** License error message if applicable */
  licenseError?: string;
}

/**
 * Connection snapshot - combines session state with trading metrics
 */
export interface ConnectionSnapshot {
  /** Connection session state */
  session: ConnectionSession;
  
  /** Trading metrics (if connected) */
  metrics?: ConnectionMetrics;
  
  /** Open positions (if connected) */
  positions?: ConnectionPosition[];
  
  /** Timestamp of this snapshot */
  timestamp: string;
  
  /** License information for this connection */
  license?: LicenseInfo;
}

/**
 * Map of account ID to connection snapshot
 */
export type ConnectionSnapshotMap = Record<string, ConnectionSnapshot>;

// ============================================================================
// Connection Actions & Events
// ============================================================================

/**
 * Parameters for establishing a connection
 */
export interface ConnectParams {
  /** Account ID to connect */
  accountId: string;
  
  /** Trading platform */
  platform: ConnectionPlatform;
  
  /** Connection role */
  role: ConnectionRole;
  
  /** Trading credentials */
  credentials: {
    login: string;
    password: string;
    server: string;
  };
  
  /** Optional custom endpoint */
  endpoint?: ConnectionEndpoint;
  
  /** Enable auto-reconnect */
  autoReconnect?: boolean;
}

/**
 * Parameters for disconnecting
 */
export interface DisconnectParams {
  /** Account ID to disconnect */
  accountId: string;
  
  /** Reason for disconnection */
  reason?: string;
}

/**
 * Connection event types
 */
export type ConnectionEventType = 
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'metrics_update'
  | 'positions_update'
  | 'reconnecting';

/**
 * Connection event payload
 */
export interface ConnectionEvent {
  /** Event type */
  type: ConnectionEventType;
  
  /** Account ID */
  accountId: string;
  
  /** Event timestamp */
  timestamp: string;
  
  /** Event data (varies by type) */
  data?: {
    error?: string;
    metrics?: ConnectionMetrics;
    positions?: ConnectionPosition[];
    attempt?: number;
  };
}

// ============================================================================
// IPC Channel Types
// ============================================================================

/**
 * Connection IPC request types
 */
export interface ConnectionIpcRequests {
  'connections:list': () => Promise<ConnectionSnapshotMap>;
  'connections:connect': (params: ConnectParams) => Promise<{ success: boolean; error?: string }>;
  'connections:disconnect': (params: DisconnectParams) => Promise<{ success: boolean; error?: string }>;
  'connections:status': (accountId: string) => Promise<ConnectionSnapshot | null>;
  'connections:refresh': (accountId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Connection IPC event names for subscription
 */
export type ConnectionIpcEventName = 
  | 'connections:snapshot'
  | 'connections:event';

// ============================================================================
// Hook Types
// ============================================================================

/**
 * Return type for useConnectionsFeed hook
 */
export interface UseConnectionsFeedReturn {
  /** Map of all connection snapshots */
  snapshots: ConnectionSnapshotMap;
  
  /** Whether the initial load is in progress */
  isLoading: boolean;
  
  /** Global error (e.g., IPC unavailable) */
  error: string | null;
  
  /** Get snapshot for a specific account */
  getSnapshot: (accountId: string) => ConnectionSnapshot | null;
  
  /** Connect an account */
  connect: (params: ConnectParams) => Promise<{ success: boolean; error?: string }>;
  
  /** Disconnect an account */
  disconnect: (accountId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Archive-disconnect: fully removes session so health-check won't auto-reconnect */
  archiveDisconnect: (accountId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  
  /** Refresh a specific account's data */
  refresh: (accountId: string) => Promise<void>;
  
  /** Refresh all connected accounts */
  refreshAll: () => Promise<void>;
  
  /** Manual refresh all from ZMQ cache (no network calls) - for Refresh button */
  manualRefreshAll: () => Promise<{ success: boolean; error?: string }>;
  
  /** Check if an account is connected */
  isConnected: (accountId: string) => boolean;
  
  /** Get connection status for an account */
  getStatus: (accountId: string) => ConnectionStatus;
}

/**
 * Options for useConnectionsFeed hook
 */
export interface UseConnectionsFeedOptions {
  /** Polling interval in milliseconds (default: 3000) */
  pollingInterval?: number;
  
  /** Whether to start polling automatically (default: true) */
  autoStart?: boolean;
  
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Helper to create an empty session for an account
 */
export function createEmptySession(
  accountId: string,
  platform: ConnectionPlatform = 'mt5',
  role: ConnectionRole = 'local'
): ConnectionSession {
  return {
    id: accountId,
    accountId,
    platform,
    role,
    status: 'disconnected',
    lastUpdate: new Date().toISOString(),
    autoReconnect: false,
  };
}

/**
 * Helper to create an empty snapshot
 */
export function createEmptySnapshot(
  accountId: string,
  platform: ConnectionPlatform = 'mt5',
  role: ConnectionRole = 'local'
): ConnectionSnapshot {
  return {
    session: createEmptySession(accountId, platform, role),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a connection is in an active state
 */
export function isActiveConnection(status: ConnectionStatus): boolean {
  return status === 'connected' || status === 'connecting' || status === 'reconnecting';
}

/**
 * Check if a connection can be retried
 */
export function canRetryConnection(status: ConnectionStatus): boolean {
  return status === 'disconnected' || status === 'error';
}

// ============================================================================
// License Types
// ============================================================================

/**
 * License status values
 */
export type LicenseStatus = 
  | 'valid'           // License is valid and active
  | 'expired'         // License has expired
  | 'invalid'         // License key is invalid
  | 'not-configured'  // No license key configured
  | 'checking'        // Currently validating
  | 'error';          // Validation error

/**
 * License information from validation
 */
export interface LicenseInfo {
  /** Current license status */
  status: LicenseStatus;
  
  /** License key (masked for display) */
  maskedKey?: string;
  
  /** When the license was last validated */
  lastChecked?: string;
  
  /** When the next validation will occur */
  nextCheckAt?: string;
  
  /** License expiration date (ISO string) */
  expiresAt?: string;
  
  /** Days until expiration */
  daysRemaining?: number;
  
  /** Error message if status is 'error' or 'invalid' */
  errorMessage?: string;
  
  /** Features enabled by this license */
  features?: string[];
  
  /** License holder email */
  email?: string;
  
  /** License tier (e.g., 'demo', 'professional', 'enterprise') */
  tier?: string;
  
  /** License plan name */
  plan?: string;
  
  /** Current device ID */
  deviceId?: string;
  
  /** Registered devices */
  devices?: DeviceInfo[];
  
  /** Number of connected agents */
  connectedAgents?: number;
  
  /** Whether secure storage (OS keychain) is being used */
  secureStorage?: boolean;
}

/**
 * Device information for license management
 */
export interface DeviceInfo {
  /** Unique device identifier */
  deviceId: string;
  
  /** Platform type */
  platform: 'desktop' | 'mt5' | 'mt4' | 'ctrader';
  
  /** Device name */
  name?: string;
  
  /** When device was registered */
  registeredAt: string;
  
  /** Last activity timestamp */
  lastSeenAt: string;
  
  /** Software version */
  version?: string;
  
  /** Whether this is the current device */
  isCurrentDevice: boolean;
}

/**
 * Connected agent information
 */
export interface ConnectedAgent {
  /** Agent ID */
  id: string;
  
  /** Platform type */
  platform: 'mt5' | 'mt4' | 'ctrader';
  
  /** Trading account ID */
  accountId: string;
  
  /** When agent connected */
  connectedAt: string;
  
  /** Last heartbeat timestamp */
  lastHeartbeat: string;
}

/**
 * License validation request
 */
export interface LicenseValidationRequest {
  /** License key to validate */
  licenseKey: string;
  
  /** Hardware/machine identifier for binding */
  machineId?: string;
}

/**
 * License validation response
 */
export interface LicenseValidationResponse {
  success: boolean;
  license?: LicenseInfo;
  error?: string;
}

// ============================================================================
// Installation Types
// ============================================================================

/**
 * Types of installable assets
 */
export type InstallableAssetType = 
  | 'mt4-ea'      // MT4 Expert Advisor
  | 'mt5-ea'      // MT5 Expert Advisor
  | 'mt4-dll'     // MT4 DLL
  | 'mt5-dll'     // MT5 DLL
  | 'ctrader-cbot'; // cTrader cBot

/**
 * Information about an installable asset
 */
export interface InstallableAsset {
  /** Asset type */
  type: InstallableAssetType;
  
  /** Display name */
  name: string;
  
  /** File name */
  fileName: string;
  
  /** Version string */
  version: string;
  
  /** Whether this asset is required or optional */
  required: boolean;
  
  /** Target subdirectory in terminal data folder */
  targetSubdir: string;
  
  /** Description of what this asset does */
  description?: string;
}

/**
 * Terminal installation target
 */
export interface InstallationTarget {
  /** Terminal ID from detection */
  terminalId: string;
  
  /** Terminal type */
  type: 'mt4' | 'mt5' | 'ctrader';
  
  /** Terminal display name */
  name: string;
  
  /** Data folder path where assets will be installed */
  dataPath: string;
  
  /** Whether terminal is currently running (needs restart) */
  isRunning: boolean;
}

/**
 * Installation precheck result
 */
export interface InstallationPrecheck {
  /** Overall precheck passed */
  passed: boolean;
  
  /** Individual check results */
  checks: {
    /** Terminal is installed */
    terminalInstalled: boolean;
    
    /** Terminal is not running (required for install) */
    terminalClosed: boolean;
    
    /** Data folder is writable */
    dataFolderWritable: boolean;
    
    /** Assets are available to copy */
    assetsAvailable: boolean;
  };
  
  /** Human-readable messages for failed checks */
  messages: string[];
}

/**
 * Installation result for a single asset
 */
export interface AssetInstallResult {
  /** Asset type */
  type: InstallableAssetType;
  
  /** Success status */
  success: boolean;
  
  /** Installed file path */
  installedPath?: string;
  
  /** Error message if failed */
  error?: string;
}

/**
 * Full installation result
 */
export interface InstallationResult {
  /** Overall success */
  success: boolean;
  
  /** Terminal ID */
  terminalId: string;
  
  /** Results for each asset */
  assets: AssetInstallResult[];
  
  /** Whether terminal restart is needed */
  restartRequired: boolean;
  
  /** Overall error message */
  error?: string;
}

// ============================================================================
// Permissions Types (MT4/MT5)
// ============================================================================

/**
 * Required MT4/MT5 terminal permissions
 */
export interface TerminalPermissions {
  /** Enable algorithmic trading */
  algoTradingEnabled: boolean;
  
  /** Enable DLL imports */
  dllImportsEnabled: boolean;
  
  /** WebRequest URLs added to allowlist */
  webRequestAllowlist: string[];
}

/**
 * Permission check item for UI display
 */
export interface PermissionCheckItem {
  /** Permission identifier */
  id: string;
  
  /** Display label */
  label: string;
  
  /** Description of what this permission does */
  description: string;
  
  /** Whether this permission is required or optional */
  required: boolean;
  
  /** Current status: null = unknown, true = enabled, false = disabled */
  status: boolean | null;
  
  /** Instructions to enable this permission */
  instructions: string[];
}
