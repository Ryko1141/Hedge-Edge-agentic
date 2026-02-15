/**
 * MT5 Cluster API Client
 * Connects to the multi-user MT5 orchestrator for scalable trading operations
 */

export interface MT5AccountInfo {
  login: number;
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  leverage: number;
  currency: string;
  server: string;
  name: string;
  company?: string;
}

export interface MT5Position {
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  open_price: number;
  current_price: number;
  profit: number;
  swap: number;
  sl: number;
  tp: number;
  time: number;
  magic: number;
  comment: string;
}

export interface MT5Order {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  price: number;
  sl: number;
  tp: number;
  time_setup: number;
  magic: number;
  comment: string;
}

export interface MT5Tick {
  symbol: string;
  bid: number;
  ask: number;
  spread?: number;
  time: number;
  volume: number;
}

export interface WorkerStatus {
  id: string;
  port: number;
  healthy: boolean;
  in_use: boolean;
  user_id: string | null;
  mt5_login: number | null;
}

export interface SessionStatus {
  has_session: boolean;
  worker_id?: string;
  external_port?: number;
  mt5_login?: number;
  created_at?: number;
  last_activity?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class MT5ClusterClient {
  private baseUrl: string;
  private userId: string;
  private apiToken: string;
  private bridge = (window as any).electronAPI;

  constructor(baseUrl: string, userId: string, apiToken: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.userId = userId;
    this.apiToken = apiToken;

    // SECURITY: Only allow connections to localhost
    if (!this.isLocalhostUrl(this.baseUrl)) {
      throw new Error('MT5 cluster client can only connect to localhost');
    }
  }

  /**
   * Verify the base URL points to localhost only
   */
  private isLocalhostUrl(url: string): boolean {
    return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?($|\/)/.test(url);
  }

  /**
   * Build standard headers with auth token (for non-credential read-only requests)
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  /**
   * Set the user ID (call when user logs in)
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Get cluster health status
   */
  async getHealth(): Promise<ApiResponse<{
    status: string;
    service: string;
    workers: Record<string, boolean>;
    active_sessions: number;
  }>> {
    const response = await fetch(`${this.baseUrl}/health`, {
      headers: this.getHeaders(),
    });
    return response.json();
  }

  /**
   * List all workers and their status
   */
  async listWorkers(): Promise<ApiResponse<WorkerStatus[]>> {
    const response = await fetch(`${this.baseUrl}/api/workers`, {
      headers: this.getHeaders(),
    });
    const data = await response.json();
    return { success: data.success, data: data.workers };
  }

  /**
   * Allocate a worker for this user
   */
  async allocateSession(mt5Login?: number, mt5Server?: string): Promise<ApiResponse<{
    worker_id: string;
    external_port: number;
  }>> {
    const response = await fetch(`${this.baseUrl}/api/session/allocate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        user_id: this.userId,
        mt5_login: mt5Login,
        mt5_server: mt5Server
      })
    });
    return response.json();
  }

  /**
   * Release the user's session
   */
  async releaseSession(): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/session/release`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id: this.userId })
    });
    return response.json();
  }

  /**
   * Get current session status
   */
  async getSessionStatus(): Promise<ApiResponse<SessionStatus>> {
    const response = await fetch(
      `${this.baseUrl}/api/session/status?user_id=${encodeURIComponent(this.userId)}`,
      { headers: this.getHeaders() }
    );
    const data = await response.json();
    return { success: data.success, data: data };
  }

  /**
   * Connect to MT5 with credentials
   * SECURITY: Routed through Electron IPC — password never leaves the main process via HTTP.
   * Falls back to localhost-only direct fetch if IPC is unavailable.
   */
  async connect(login: number, password: string, server: string): Promise<ApiResponse> {
    // Option A: Route through main process IPC (preferred)
    if (this.bridge?.mt5Cluster?.connect) {
      return await this.bridge.mt5Cluster.connect({
        baseUrl: this.baseUrl,
        userId: this.userId,
        login,
        password,
        server,
        apiToken: this.apiToken,
      });
    }

    // Fallback: direct localhost-only fetch (only if IPC unavailable)
    const response = await fetch(`${this.baseUrl}/api/connect`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        user_id: this.userId,
        login,
        password,
        server
      })
    });
    return response.json();
  }

  /**
   * Disconnect from MT5 and release session
   * SECURITY: Routed through Electron IPC when available.
   */
  async disconnect(): Promise<ApiResponse> {
    if (this.bridge?.mt5Cluster?.disconnect) {
      return await this.bridge.mt5Cluster.disconnect({
        baseUrl: this.baseUrl,
        userId: this.userId,
        apiToken: this.apiToken,
      });
    }

    const response = await fetch(`${this.baseUrl}/api/disconnect`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ user_id: this.userId })
    });
    return response.json();
  }

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<ApiResponse<MT5AccountInfo>> {
    const response = await fetch(
      `${this.baseUrl}/api/account/info?user_id=${encodeURIComponent(this.userId)}`,
      { headers: this.getHeaders() }
    );
    return response.json();
  }

  /**
   * Get open positions
   */
  async getPositions(): Promise<ApiResponse<MT5Position[]>> {
    const response = await fetch(
      `${this.baseUrl}/api/positions?user_id=${encodeURIComponent(this.userId)}`,
      { headers: this.getHeaders() }
    );
    return response.json();
  }

  /**
   * Get pending orders
   */
  async getOrders(): Promise<ApiResponse<MT5Order[]>> {
    const response = await fetch(
      `${this.baseUrl}/api/orders?user_id=${encodeURIComponent(this.userId)}`,
      { headers: this.getHeaders() }
    );
    return response.json();
  }

  /**
   * Open a new trade
   */
  async openTrade(params: {
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    sl?: number;
    tp?: number;
    comment?: string;
    magic?: number;
  }): Promise<ApiResponse<{ ticket: number; volume: number; price: number }>> {
    const response = await fetch(`${this.baseUrl}/api/trade/open`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        user_id: this.userId,
        ...params
      })
    });
    return response.json();
  }

  /**
   * Close a position
   */
  async closeTrade(ticket: number): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/trade/close`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        user_id: this.userId,
        ticket
      })
    });
    return response.json();
  }

  /**
   * Get current tick data for a symbol
   */
  async getTick(symbol: string = 'EURUSD'): Promise<ApiResponse<MT5Tick>> {
    const response = await fetch(
      `${this.baseUrl}/api/tick?user_id=${encodeURIComponent(this.userId)}&symbol=${encodeURIComponent(symbol)}`,
      { headers: this.getHeaders() }
    );
    return response.json();
  }

  /**
   * Get available symbols
   */
  async getSymbols(): Promise<ApiResponse<Array<{ name: string; visible: boolean }>>> {
    const response = await fetch(
      `${this.baseUrl}/api/symbols?user_id=${encodeURIComponent(this.userId)}`,
      { headers: this.getHeaders() }
    );
    return response.json();
  }
}

// Singleton instance factory
let clientInstance: MT5ClusterClient | null = null;

export function getMT5Client(baseUrl?: string, userId?: string, apiToken?: string): MT5ClusterClient {
  if (!clientInstance && baseUrl && userId) {
    clientInstance = new MT5ClusterClient(baseUrl, userId, apiToken);
  }
  if (!clientInstance) {
    throw new Error('MT5 client not initialized. Call getMT5Client(baseUrl, userId) first.');
  }
  return clientInstance;
}

export function initMT5Client(baseUrl: string, userId: string, apiToken: string = ''): MT5ClusterClient {
  clientInstance = new MT5ClusterClient(baseUrl, userId, apiToken);
  return clientInstance;
}

export function resetMT5Client(): void {
  clientInstance = null;
}
