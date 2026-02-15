/**
 * MetaAPI Proxy — all MetaAPI HTTP calls live here in the main process.
 * The token never leaves this process; the renderer communicates via IPC only.
 */
import { ipcMain } from 'electron';

const METAAPI_BASE = 'https://mt-provisioning-api-v1.agiliumtrade.ai';
const METAAPI_CLIENT = 'https://mt-client-api-v1.agiliumtrade.ai';

/** Lazy token accessor — reads process.env each call so late-set env is picked up. */
function getToken(): string {
  return process.env.METAAPI_TOKEN || '';
}

if (!getToken()) {
  console.warn('[MetaAPI] METAAPI_TOKEN not set — MetaAPI features unavailable.');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validates an accountId to prevent path-traversal injection. */
const ACCOUNT_ID_RE = /^[a-f0-9-]+$/i;
function validateAccountId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && ACCOUNT_ID_RE.test(id);
}

/** Error subclass that carries the HTTP status for retry decisions. */
class MetaApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MetaApiError';
  }
}

/** Status codes that should NOT be retried in polling loops. */
const NON_RETRYABLE = new Set([400, 401, 403, 404, 429]);

async function metaFetch(url: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'auth-token': token,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).message || (body as any).error || `HTTP ${res.status}`;
    throw new MetaApiError(msg, res.status);
  }
  // 204 or empty body → null
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function fail(msg: string) {
  return { error: msg };
}

// ---------------------------------------------------------------------------
// IPC handler registration (call once at app startup)
// ---------------------------------------------------------------------------

export function registerMetaApiHandlers(): void {
  // ---- Provisioning API ---------------------------------------------------

  ipcMain.handle('metaapi:listAccounts', async () => {
    if (!getToken()) return fail('MetaAPI not configured');
    try {
      return { data: await metaFetch(`${METAAPI_BASE}/users/current/accounts`) };
    } catch (e: any) {
      console.error('[MetaAPI] listAccounts:', e.message);
      return fail('Failed to list accounts');
    }
  });

  ipcMain.handle('metaapi:findAccountByLogin', async (_ev, login: string, server: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!login || !server) return fail('login and server required');
    try {
      const accounts: any[] = await metaFetch(`${METAAPI_BASE}/users/current/accounts`);
      const match = accounts.find((a: any) => a.login === login && a.server === server) ?? null;
      return { data: match };
    } catch (e: any) {
      console.error('[MetaAPI] findAccountByLogin:', e.message);
      return fail('Failed to search accounts');
    }
  });

  ipcMain.handle('metaapi:createAccount', async (_ev, accountData: {
    name: string; login: string; password: string;
    server: string; platform: string; type?: string; magic?: number;
  }) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!accountData?.login || !accountData?.server || !accountData?.platform) {
      return fail('Missing required fields');
    }
    try {
      const result = await metaFetch(`${METAAPI_BASE}/users/current/accounts`, {
        method: 'POST',
        body: JSON.stringify({
          name: accountData.name || `MT5-${accountData.login}`,
          login: accountData.login,
          password: accountData.password,
          server: accountData.server,
          platform: accountData.platform || 'mt5',
          type: accountData.type || 'cloud-g2',
          magic: accountData.magic ?? 0,
          application: 'MetaApi',
        }),
      });
      return { data: result };
    } catch (e: any) {
      console.error('[MetaAPI] createAccount:', e.message);
      return fail(e.message || 'Failed to create account');
    }
  });

  ipcMain.handle('metaapi:deployAccount', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}/deploy`, { method: 'POST' });
      return { success: true };
    } catch (e: any) {
      // 409 = already deployed — treat as success
      if (e instanceof MetaApiError && e.status === 409) return { success: true };
      console.error('[MetaAPI] deployAccount:', e.message);
      return fail('Failed to deploy account');
    }
  });

  ipcMain.handle('metaapi:getAccountState', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      const data = await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}`);
      return { data: { state: data.state, connectionStatus: data.connectionStatus } };
    } catch (e: any) {
      console.error('[MetaAPI] getAccountState:', e.message);
      return fail('Failed to get account state');
    }
  });

  ipcMain.handle('metaapi:removeAccount', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      // Undeploy first, then delete
      await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}/undeploy`, { method: 'POST' }).catch(() => {});
      await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}`, { method: 'DELETE' });
      return { success: true };
    } catch (e: any) {
      console.error('[MetaAPI] removeAccount:', e.message);
      return fail('Failed to remove account');
    }
  });

  // ---- Client API (account info, positions, orders) -----------------------

  ipcMain.handle('metaapi:getAccountInfo', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      const data = await metaFetch(
        `${METAAPI_CLIENT}/users/current/accounts/${accountId}/account-information`,
      );
      return { data };
    } catch (e: any) {
      console.error('[MetaAPI] getAccountInfo:', e.message);
      return fail('Failed to get account info');
    }
  });

  ipcMain.handle('metaapi:getPositions', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      return { data: await metaFetch(`${METAAPI_CLIENT}/users/current/accounts/${accountId}/positions`) };
    } catch (e: any) {
      console.error('[MetaAPI] getPositions:', e.message);
      return fail('Failed to get positions');
    }
  });

  ipcMain.handle('metaapi:getOrders', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      return { data: await metaFetch(`${METAAPI_CLIENT}/users/current/accounts/${accountId}/orders`) };
    } catch (e: any) {
      console.error('[MetaAPI] getOrders:', e.message);
      return fail('Failed to get orders');
    }
  });

  ipcMain.handle('metaapi:getAccountSnapshot', async (_ev, accountId: string) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!validateAccountId(accountId)) return fail('Invalid account ID');
    try {
      const [accountInfo, positions, orders] = await Promise.all([
        metaFetch(`${METAAPI_CLIENT}/users/current/accounts/${accountId}/account-information`),
        metaFetch(`${METAAPI_CLIENT}/users/current/accounts/${accountId}/positions`),
        metaFetch(`${METAAPI_CLIENT}/users/current/accounts/${accountId}/orders`),
      ]);
      return {
        data: {
          accountInfo,
          positions: positions ?? [],
          orders: orders ?? [],
          connected: true,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (e: any) {
      console.error('[MetaAPI] getAccountSnapshot:', e.message);
      return fail('Failed to get account snapshot');
    }
  });

  // ---- Compound: provision (find-or-create + deploy + wait) ---------------

  ipcMain.handle('metaapi:provisionAccount', async (_ev, request: {
    name: string; login: string; password: string;
    server: string; platform: string; type?: string; magic?: number;
  }) => {
    if (!getToken()) return fail('MetaAPI not configured');
    if (!request?.login || !request?.server || !request?.platform) {
      return fail('Missing required fields');
    }

    try {
      // Check for existing account
      const accounts: any[] = await metaFetch(`${METAAPI_BASE}/users/current/accounts`);
      const existing = accounts.find((a: any) => a.login === request.login && a.server === request.server);

      let accountId: string;

      if (existing) {
        accountId = existing._id;
        if (existing.state !== 'DEPLOYED') {
          await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}/deploy`, { method: 'POST' }).catch(() => {});
        }
      } else {
        const created = await metaFetch(`${METAAPI_BASE}/users/current/accounts`, {
          method: 'POST',
          body: JSON.stringify({
            name: request.name || `MT5-${request.login}`,
            login: request.login,
            password: request.password,
            server: request.server,
            platform: request.platform || 'mt5',
            type: request.type || 'cloud-g2',
            magic: request.magic ?? 0,
            application: 'MetaApi',
          }),
        });
        accountId = created.id;
        await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}/deploy`, { method: 'POST' }).catch(() => {});
      }

      // Wait for connection (up to ~2 min), but bail on non-retryable errors
      let accountInfo: any = null;
      for (let i = 0; i < 60; i++) {
        try {
          const state = await metaFetch(`${METAAPI_BASE}/users/current/accounts/${accountId}`);
          if (state?.connectionStatus === 'CONNECTED') {
            accountInfo = await metaFetch(
              `${METAAPI_CLIENT}/users/current/accounts/${accountId}/account-information`,
            );
            if (accountInfo) break;
          }
        } catch (retryErr) {
          // Stop retrying on auth / quota / client errors — only retry on transient failures
          if (retryErr instanceof MetaApiError && NON_RETRYABLE.has(retryErr.status)) {
            console.error('[MetaAPI] provisionAccount: non-retryable error during poll:', retryErr.message);
            return fail(retryErr.message);
          }
          // transient — keep polling
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (accountInfo) {
        return { data: { success: true, accountId, accountInfo } };
      }
      return { data: { success: true, accountId, error: 'Account created and deploying. Connection may take 1-2 minutes.' } };
    } catch (e: any) {
      console.error('[MetaAPI] provisionAccount:', e.message);
      return fail(e.message || 'Failed to provision account');
    }
  });

  ipcMain.handle('metaapi:isConfigured', () => {
    return { data: Boolean(getToken()) };
  });

  console.log('[MetaAPI] IPC handlers registered.');
}
