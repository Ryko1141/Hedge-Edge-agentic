/**
 * Session Manager — Connection state for MT5/cTrader terminals.
 *
 * Extracted from main.ts to break the monolith. Contains:
 * - All connection-related type definitions
 * - Centralised session/metrics/position state maps
 * - Persistence (load/save to JSON)
 * - Pure CRUD helpers (no electron/zmq dependencies)
 */

import { promises as fsPromises } from 'fs';
import path from 'path';
import { app } from 'electron';

// ============================================================================
// Types
// ============================================================================

export type ConnectionPlatform = 'mt5' | 'ctrader';
export type ConnectionRole = 'local' | 'vps' | 'cloud';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface ConnectionEndpoint {
  host: string;
  port: number;
  secure?: boolean;
}

export interface ConnectionMetrics {
  balance: number;
  equity: number;
  profit: number;
  positionCount: number;
  margin?: number;
  freeMargin?: number;
  marginLevel?: number;
}

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

export interface ConnectionSession {
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
  /** Internal: stored credentials for auto-reconnect (never exposed via IPC) */
  _credentials?: { login: string; password: string; server: string };
  /** Internal: ZeroMQ terminal ID for multi-account routing */
  _terminalId?: string;
}

export interface ConnectionSnapshot {
  session: ConnectionSession;
  metrics?: ConnectionMetrics;
  positions?: ConnectionPosition[];
  timestamp: string;
}

export type ConnectionSnapshotMap = Record<string, ConnectionSnapshot>;

export interface PersistedSession {
  accountId: string;
  platform: ConnectionPlatform;
  role: ConnectionRole;
  login: string;
  server: string;
  lastConnected?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** If no fresh data from EA/cBot within this threshold, consider it disconnected.
 *  15 s is generous enough to absorb brief MT5 chart-loading pauses and
 *  network hiccups without false-flagging a disconnect. */
export const EA_STALENESS_THRESHOLD_MS = 15_000; // 15 seconds

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager {
  // Canonical state maps
  readonly sessions: Map<string, ConnectionSession> = new Map();
  readonly metrics: Map<string, ConnectionMetrics> = new Map();
  readonly positions: Map<string, ConnectionPosition[]> = new Map();
  readonly lastEADataTimestamp: Map<string, Date> = new Map();

  private sessionsFilePath: string;

  constructor() {
    this.sessionsFilePath = path.join(app.getPath('userData'), 'connection-sessions.json');
  }

  // ─── Pure Helpers ──────────────────────────────────────────────

  /** Get a sanitized session (strips internal _credentials) */
  getSanitizedSession(session: ConnectionSession): ConnectionSession {
    const { _credentials, ...sanitized } = session;
    void _credentials; // Explicitly discard — we strip it from the IPC payload
    return sanitized;
  }

  /** Update session status + timestamps */
  updateSessionStatus(accountId: string, status: ConnectionStatus, error?: string): void {
    const session = this.sessions.get(accountId);
    if (session) {
      session.status = status;
      session.lastUpdate = new Date().toISOString();
      session.error = error;
      if (status === 'connected') {
        session.lastConnected = session.lastUpdate;
        session.reconnectAttempts = 0;
      }
      this.sessions.set(accountId, session);
    }
  }

  // ─── Persistence ───────────────────────────────────────────────

  async loadPersistedSessions(): Promise<PersistedSession[]> {
    try {
      const data = await fsPromises.readFile(this.sessionsFilePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async savePersistedSessions(): Promise<void> {
    const persisted: PersistedSession[] = [];
    for (const [accountId, session] of this.sessions) {
      if (session._credentials) {
        persisted.push({
          accountId,
          platform: session.platform,
          role: session.role,
          login: session._credentials.login,
          server: session._credentials.server,
          lastConnected: session.lastConnected,
        });
      }
    }
    try {
      await fsPromises.writeFile(this.sessionsFilePath, JSON.stringify(persisted, null, 2), 'utf-8');
      console.log('[SessionManager] Saved', persisted.length, 'sessions to disk');
    } catch (error) {
      console.error('[SessionManager] Failed to save sessions:', error);
    }
  }
}
