/**
 * Desktop utilities for HedgeEdge Electron app
 * Safe wrappers around Electron APIs
 * 
 * This is a desktop-only application - all code assumes Electron context.
 */

import type {
  ConnectionSnapshot,
  ConnectionSnapshotMap,
  ConnectParams,
  ConnectionStatus,
  ConnectionPlatform,
  ConnectionRole,
} from '@/types/connections';

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if running inside Electron desktop app
 * Should always return true in production builds
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
}

/**
 * Assert that we're running in Electron - throws if not
 */
export function assertElectron(): void {
  if (!isElectron()) {
    throw new Error('HedgeEdge must run as a desktop application');
  }
}

/**
 * Check if connections API is available
 */
export function isConnectionsApiAvailable(): boolean {
  return isElectron() && !!window.electronAPI?.connections;
}

// ============================================================================
// App Info
// ============================================================================

/**
 * Get the application version
 * Returns package.json version in Electron, 'unknown' otherwise
 */
export async function getAppVersion(): Promise<string> {
  if (isElectron()) {
    return window.electronAPI!.getVersion();
  }
  return 'unknown';
}

/**
 * Get platform information
 */
export async function getPlatformInfo(): Promise<{
  platform: string;
  arch: string;
  isPackaged: boolean;
}> {
  if (isElectron()) {
    return window.electronAPI!.getPlatform();
  }
  return {
    platform: navigator.platform,
    arch: 'unknown',
    isPackaged: false,
  };
}

// ============================================================================
// External Links
// ============================================================================

/**
 * Open a URL in the external browser
 */
export async function openExternal(url: string): Promise<boolean> {
  // Validate URL
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      console.warn('Invalid protocol for openExternal:', parsedUrl.protocol);
      return false;
    }
  } catch {
    console.warn('Invalid URL for openExternal:', url);
    return false;
  }

  if (isElectron()) {
    return window.electronAPI!.openExternal(url);
  }
  
  // Fallback (shouldn't happen in packaged app)
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Platform-aware link handler
 * Use this for links that should open externally in desktop
 */
export function handleExternalLink(event: React.MouseEvent, url: string): void {
  if (isElectron()) {
    event.preventDefault();
    openExternal(url);
  }
  // In browser, let the default behavior handle it
}

// ============================================================================
// Connection Supervisor
// ============================================================================

/**
 * Connection supervisor manages per-account session state and provides
 * a unified interface for connection management across the app.
 */

export interface ConnectionSupervisorState {
  snapshots: ConnectionSnapshotMap;
  isInitialized: boolean;
  lastUpdate: Date | null;
}

type ConnectionListener = (snapshots: ConnectionSnapshotMap) => void;

class ConnectionSupervisor {
  private state: ConnectionSupervisorState = {
    snapshots: {},
    isInitialized: false,
    lastUpdate: null,
  };
  
  private listeners: Set<ConnectionListener> = new Set();
  private unsubscribe: (() => void) | null = null;
  private pollingInterval: number = 3000;

  /**
   * Initialize the supervisor and start listening for updates
   */
  async initialize(pollingInterval: number = 3000): Promise<void> {
    if (!isConnectionsApiAvailable()) {
      console.warn('[ConnectionSupervisor] Connections API not available');
      return;
    }

    this.pollingInterval = pollingInterval;

    // Get initial state
    try {
      const snapshots = await window.electronAPI!.connections.list();
      this.state.snapshots = snapshots;
      this.state.isInitialized = true;
      this.state.lastUpdate = new Date();
      this.notifyListeners();
    } catch (error) {
      console.error('[ConnectionSupervisor] Failed to get initial state:', error);
    }

    // Start listening for updates
    this.unsubscribe = window.electronAPI!.connections.onSnapshotUpdate(
      (snapshots) => {
        this.state.snapshots = snapshots;
        this.state.lastUpdate = new Date();
        this.notifyListeners();
      },
      this.pollingInterval
    );
  }

  /**
   * Shutdown the supervisor
   */
  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.listeners.clear();
    this.state = {
      snapshots: {},
      isInitialized: false,
      lastUpdate: null,
    };
  }

  /**
   * Subscribe to snapshot updates
   */
  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current state
    if (this.state.isInitialized) {
      listener(this.state.snapshots);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state.snapshots);
      } catch (error) {
        console.error('[ConnectionSupervisor] Listener error:', error);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): ConnectionSupervisorState {
    return { ...this.state };
  }

  /**
   * Get snapshot for a specific account.
   * Looks up by key first, then falls back to matching by mt5Login.
   */
  getSnapshot(accountId: string): ConnectionSnapshot | null {
    if (this.state.snapshots[accountId]) return this.state.snapshots[accountId];
    // Try with "mt5-" prefix (caller may pass raw login)
    const prefixed = `mt5-${accountId}`;
    if (this.state.snapshots[prefixed]) return this.state.snapshots[prefixed];
    // Fallback: search by mt5Login field
    for (const snap of Object.values(this.state.snapshots)) {
      if ((snap.session as any)?.mt5Login === accountId) return snap;
    }
    return null;
  }

  /**
   * Connect an account
   */
  async connect(params: ConnectParams): Promise<{ success: boolean; error?: string }> {
    if (!isConnectionsApiAvailable()) {
      return { success: false, error: 'Connections API not available' };
    }

    const result = await window.electronAPI!.connections.connect(params);
    
    // Refresh state after connection attempt
    if (result.success) {
      const snapshots = await window.electronAPI!.connections.list();
      this.state.snapshots = snapshots;
      this.state.lastUpdate = new Date();
      this.notifyListeners();
    }

    return result;
  }

  /**
   * Disconnect an account
   */
  async disconnect(accountId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    if (!isConnectionsApiAvailable()) {
      return { success: false, error: 'Connections API not available' };
    }

    const result = await window.electronAPI!.connections.disconnect({ accountId, reason });
    
    // Refresh state after disconnection
    const snapshots = await window.electronAPI!.connections.list();
    this.state.snapshots = snapshots;
    this.state.lastUpdate = new Date();
    this.notifyListeners();

    return result;
  }

  /**
   * Archive-disconnect: fully removes session so health-check won't auto-reconnect.
   * The ZMQ bridge stays alive so the terminal can be re-discovered for a new account.
   */
  async archiveDisconnect(accountId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    if (!isConnectionsApiAvailable()) {
      return { success: false, error: 'Connections API not available' };
    }

    const result = await window.electronAPI!.connections.archiveDisconnect({ accountId, reason });

    // Refresh state after archive-disconnect
    const snapshots = await window.electronAPI!.connections.list();
    this.state.snapshots = snapshots;
    this.state.lastUpdate = new Date();
    this.notifyListeners();

    return result;
  }

  /**
   * Refresh data for a specific account
   */
  async refresh(accountId: string): Promise<{ success: boolean; error?: string }> {
    if (!isConnectionsApiAvailable()) {
      return { success: false, error: 'Connections API not available' };
    }

    const result = await window.electronAPI!.connections.refresh(accountId);
    
    // Get updated state
    const snapshots = await window.electronAPI!.connections.list();
    this.state.snapshots = snapshots;
    this.state.lastUpdate = new Date();
    this.notifyListeners();

    return result;
  }

  /**
   * Refresh all connected accounts
   */
  async refreshAll(): Promise<void> {
    if (!isConnectionsApiAvailable()) {
      return;
    }

    const accountIds = Object.keys(this.state.snapshots);
    await Promise.all(
      accountIds
        .filter(id => this.state.snapshots[id]?.session.status === 'connected')
        .map(id => window.electronAPI!.connections.refresh(id).catch(() => {}))
    );

    // Get updated state
    const snapshots = await window.electronAPI!.connections.list();
    this.state.snapshots = snapshots;
    this.state.lastUpdate = new Date();
    this.notifyListeners();
  }

  /**
   * Manual refresh all accounts from ZMQ cache (no network calls)
   * Used by the dashboard Refresh button - reads cached data and pushes to renderer
   */
  async manualRefreshAll(): Promise<{ success: boolean; error?: string }> {
    if (!isConnectionsApiAvailable()) {
      return { success: false, error: 'Connections API not available' };
    }

    try {
      const result = await window.electronAPI!.connections.manualRefreshAll();
      // The IPC handler already pushes updates to renderer via connections:update
      // So listeners will be notified automatically
      this.state.lastUpdate = new Date();
      return result;
    } catch (err) {
      console.error('[ConnectionSupervisor] Manual refresh all failed:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Refresh failed' };
    }
  }

  /**
   * Reconnect all persisted accounts (called on app startup)
   */
  async reconnect(): Promise<{ reconnected: number; failed: number }> {
    if (!isConnectionsApiAvailable()) {
      return { reconnected: 0, failed: 0 };
    }

    const result = await window.electronAPI!.connections.reconnect();
    
    // Refresh state after reconnection
    const snapshots = await window.electronAPI!.connections.list();
    this.state.snapshots = snapshots;
    this.state.lastUpdate = new Date();
    this.notifyListeners();

    return result;
  }

  /**
   * Refresh connections from EA files in MT5 terminals
   * This scans running terminals and reconnects any accounts that have EA data
   */
  async refreshFromEA(): Promise<{ found: number; reconnected: number }> {
    if (!isConnectionsApiAvailable()) {
      return { found: 0, reconnected: 0 };
    }

    const result = await window.electronAPI!.connections.refreshFromEA();
    
    // Refresh state after EA scan
    const snapshots = await window.electronAPI!.connections.list();
    this.state.snapshots = snapshots;
    this.state.lastUpdate = new Date();
    this.notifyListeners();

    return result;
  }

  /**
   * Check if an account is connected
   */
  isConnected(accountId: string): boolean {
    const snapshot = this.getSnapshot(accountId);
    return snapshot?.session.status === 'connected';
  }

  /**
   * Get connection status for an account
   */
  getStatus(accountId: string): ConnectionStatus {
    const snapshot = this.getSnapshot(accountId);
    return snapshot?.session.status || 'disconnected';
  }
}

// Singleton instance
export const connectionSupervisor = new ConnectionSupervisor();

// ============================================================================
// Connection Helper Functions
// ============================================================================

/**
 * Build connect params from account data
 */
export function buildConnectParams(
  accountId: string,
  login: string,
  password: string,
  server: string,
  platform: ConnectionPlatform = 'mt5',
  role: ConnectionRole = 'local',
  autoReconnect: boolean = false
): ConnectParams {
  return {
    accountId,
    platform,
    role,
    credentials: { login, password, server },
    autoReconnect,
  };
}

/**
 * Format connection status for display
 */
export function formatConnectionStatus(status: ConnectionStatus): string {
  const statusLabels: Record<ConnectionStatus, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Connected',
    error: 'Error',
    reconnecting: 'Reconnecting...',
  };
  return statusLabels[status] || status;
}

/**
 * Get status color class for Tailwind
 */
export function getStatusColorClass(status: ConnectionStatus): string {
  const colorClasses: Record<ConnectionStatus, string> = {
    disconnected: 'text-muted-foreground',
    connecting: 'text-yellow-500',
    connected: 'text-primary',
    error: 'text-destructive',
    reconnecting: 'text-yellow-500',
  };
  return colorClasses[status] || 'text-muted-foreground';
}

/**
 * Get status badge variant
 */
export function getStatusBadgeClass(status: ConnectionStatus): string {
  const badgeClasses: Record<ConnectionStatus, string> = {
    disconnected: 'bg-muted/50 text-muted-foreground border-border/50',
    connecting: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    connected: 'bg-primary/10 text-primary border-primary/20',
    error: 'bg-destructive/10 text-destructive border-destructive/20',
    reconnecting: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  };
  return badgeClasses[status] || 'bg-muted/50 text-muted-foreground';
}
