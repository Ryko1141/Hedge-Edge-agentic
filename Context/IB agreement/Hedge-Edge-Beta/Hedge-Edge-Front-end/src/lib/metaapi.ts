/**
 * MetaAPI Cloud Service
 * All calls are proxied through the Electron main process via IPC.
 * The MetaAPI token NEVER exists in the renderer process.
 */

// ---------------------------------------------------------------------------
// Shared types (kept for consumers)
// ---------------------------------------------------------------------------

export interface MetaApiAccount {
  _id: string;
  name: string;
  type: string;
  login: string;
  server: string;
  state: string;
  connectionStatus: string;
  platform: 'mt4' | 'mt5';
}

export interface MetaApiAccountInfo {
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  name: string;
  login: number;
  credit: number;
  tradeAllowed: boolean;
  investorMode: boolean;
  marginMode: string;
}

export interface MetaApiPosition {
  id: string;
  symbol: string;
  type: 'POSITION_TYPE_BUY' | 'POSITION_TYPE_SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  profit: number;
  swap: number;
  commission: number;
  currentTickValue?: number;
  openTime: string;
  magic?: number;
  comment?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface MetaApiOrder {
  id: string;
  symbol: string;
  type: string;
  volume: number;
  openPrice: number;
  state: string;
  openTime: string;
  comment?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ProvisionAccountRequest {
  name: string;
  login: string;
  password: string;
  server: string;
  platform: 'mt4' | 'mt5';
  type?: 'cloud' | 'cloud-g1' | 'cloud-g2';
  magic?: number;
}

export interface ValidationResult {
  success: boolean;
  accountId?: string;
  error?: string;
  accountInfo?: MetaApiAccountInfo;
}

export interface AccountSnapshot {
  accountInfo: MetaApiAccountInfo;
  positions: MetaApiPosition[];
  orders: MetaApiOrder[];
  connected: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// IPC bridge helper
// ---------------------------------------------------------------------------

type IpcResult<T> = { data?: T; error?: string; success?: boolean };

function getBridge() {
  return (window as any).electronAPI?.metaapi as Record<string, (...args: any[]) => Promise<IpcResult<any>>> | undefined;
}

// ---------------------------------------------------------------------------
// MetaAPI Service — thin IPC wrapper
// ---------------------------------------------------------------------------

class MetaApiService {
  private get bridge() { return getBridge(); }

  /** Provision (find-or-create + deploy + wait-for-connection) */
  async provisionAccount(request: ProvisionAccountRequest): Promise<ValidationResult> {
    if (!this.bridge) return { success: false, error: 'MetaAPI not available (not in Electron)' };
    const res = await this.bridge.provisionAccount(request);
    if (res.error) return { success: false, error: res.error };
    return res.data as ValidationResult;
  }

  /** Find existing account by login + server */
  async findAccountByLogin(login: string, server: string): Promise<MetaApiAccount | null> {
    if (!this.bridge) return null;
    const res = await this.bridge.findAccountByLogin(login, server);
    return res.data ?? null;
  }

  /** List all provisioned accounts */
  async getAccounts(): Promise<MetaApiAccount[]> {
    if (!this.bridge) return [];
    const res = await this.bridge.listAccounts();
    return res.data ?? [];
  }

  /** Deploy an account */
  async deployAccount(accountId: string): Promise<boolean> {
    if (!this.bridge) return false;
    const res = await this.bridge.deployAccount(accountId);
    return !!res.success;
  }

  /** Get account deployment/connection state */
  async getAccountState(accountId: string): Promise<{ state: string; connectionStatus: string } | null> {
    if (!this.bridge) return null;
    const res = await this.bridge.getAccountState(accountId);
    return res.data ?? null;
  }

  /** Get account info (balance, equity, etc.) */
  async getAccountInfo(accountId: string): Promise<MetaApiAccountInfo | null> {
    if (!this.bridge) return null;
    const res = await this.bridge.getAccountInfo(accountId);
    return res.data ?? null;
  }

  /** Get open positions */
  async getPositions(accountId: string): Promise<MetaApiPosition[]> {
    if (!this.bridge) return [];
    const res = await this.bridge.getPositions(accountId);
    return res.data ?? [];
  }

  /** Get pending orders */
  async getOrders(accountId: string): Promise<MetaApiOrder[]> {
    if (!this.bridge) return [];
    const res = await this.bridge.getOrders(accountId);
    return res.data ?? [];
  }

  /** Full snapshot (info + positions + orders) */
  async getAccountSnapshot(accountId: string): Promise<AccountSnapshot | null> {
    if (!this.bridge) return null;
    const res = await this.bridge.getAccountSnapshot(accountId);
    return res.data ?? null;
  }

  /** Remove / undeploy an account */
  async removeAccount(accountId: string): Promise<boolean> {
    if (!this.bridge) return false;
    const res = await this.bridge.removeAccount(accountId);
    return !!res.success;
  }

  /** Check if MetaAPI token is configured in main process */
  isConfigured(): boolean {
    // Synchronous best-effort check — call isConfiguredAsync for definitive answer
    return !!this.bridge;
  }

  async isConfiguredAsync(): Promise<boolean> {
    if (!this.bridge) return false;
    const res = await this.bridge.isConfigured();
    return !!res.data;
  }
}

// Export singleton instance
export const metaApiService = new MetaApiService();

export default metaApiService;
