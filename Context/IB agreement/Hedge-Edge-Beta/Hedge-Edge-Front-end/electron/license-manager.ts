/**
 * Centralized License Manager for HedgeEdge Desktop App
 * 
 * Responsibilities:
 * - Cache validated licenses with TTL
 * - Handle token refresh before expiry
 * - Track connected devices/terminals
 * - Emit events for license state changes
 * - Sync license state across connected agents
 */

import { EventEmitter } from 'events';
import { app } from 'electron';
import { licenseStore, type LicenseInfo, type LicenseStatus } from './license-store.js';
import * as os from 'os';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface LicenseResult {
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

export interface RefreshResult {
  success: boolean;
  token?: string;
  ttlSeconds?: number;
  message?: string;
  error?: string;
}

export interface DeviceInfo {
  deviceId: string;
  platform: 'desktop' | 'mt5' | 'mt4' | 'ctrader';
  name?: string;
  registeredAt: string;
  lastSeenAt: string;
  version?: string;
  isCurrentDevice: boolean;
}

export interface LicenseStateEvent {
  type: 'validated' | 'refreshed' | 'expired' | 'error' | 'device_added' | 'device_removed' | 'expiry_warning';
  license: LicenseInfo;
  devices?: DeviceInfo[];
  warningHours?: number;
  error?: string;
}

interface CachedLicense {
  license: LicenseResult;
  token: string;
  cachedAt: number;
  expiresAt: number;
  refreshAt: number;
}

interface ConnectedAgent {
  id: string;
  platform: 'mt5' | 'mt4' | 'ctrader';
  accountId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

// ============================================================================
// Constants
// ============================================================================

// Railway-hosted license API, with local fallback for dev
const LICENSE_VALIDATE_URL = process.env.HEDGE_EDGE_LICENSE_VALIDATE_URL
  || 'https://hedgeedge-railway-backend-production.up.railway.app/api/validate-license';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry
const EXPIRY_WARNING_HOURS = 24; // Warn 24 hours before license expiry
const DEVICE_CHECK_INTERVAL_MS = 60 * 1000; // Check devices every minute
const MAX_CACHE_AGE_MS = 60 * 60 * 1000; // Max cache age 1 hour

// ============================================================================
// License Manager Class
// ============================================================================

/**
 * Centralized License Manager
 * 
 * Events:
 * - 'license:change' - License state changed (validated, expired, error)
 * - 'license:warning' - License expiring soon (24h warning)
 * - 'device:connected' - New device/agent connected
 * - 'device:disconnected' - Device/agent disconnected
 * - 'token:refreshed' - Session token was refreshed
 */
export class LicenseManager extends EventEmitter {
  private cachedLicense: CachedLicense | null = null;
  private connectedAgents: Map<string, ConnectedAgent> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;
  private warningTimer: NodeJS.Timeout | null = null;
  private deviceCheckTimer: NodeJS.Timeout | null = null;
  private deviceId: string | null = null;
  private isInitialized = false;

  constructor() {
    super();
    this.deviceId = this.generateDeviceId();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the license manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[LicenseManager] Initializing...');

    // Initialize the underlying license store
    await licenseStore.initialize();

    // Check if we have a stored license
    const storedStatus = licenseStore.getStatus();
    if (storedStatus.status === 'valid' || storedStatus.status === 'checking') {
      // Attempt to refresh/validate the stored license
      await this.refreshLicense();
    }

    // Start periodic checks
    this.startPeriodicChecks();

    this.isInitialized = true;
    console.log('[LicenseManager] Initialized successfully');
  }

  /**
   * Shutdown the license manager
   */
  async shutdown(): Promise<void> {
    console.log('[LicenseManager] Shutting down...');

    this.stopPeriodicChecks();
    this.connectedAgents.clear();
    this.cachedLicense = null;
    this.isInitialized = false;

    this.emit('shutdown');
  }

  // ==========================================================================
  // Device ID Generation
  // ==========================================================================

  /**
   * Generate a unique device ID using a persisted random secret + hardware factors.
   * The random secret ensures two machines with identical hardware produce different IDs.
   * On Windows, the Machine GUID from the registry is also mixed in for extra entropy.
   */
  private generateDeviceId(): string {
    // 1. Persisted per-install random secret
    const machineIdPath = path.join(app.getPath('userData'), '.machine-id');
    let machineSecret: string;

    try {
      if (fs.existsSync(machineIdPath)) {
        machineSecret = fs.readFileSync(machineIdPath, 'utf8').trim();
      } else {
        machineSecret = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(machineIdPath, machineSecret, { mode: 0o600 });
      }
    } catch {
      // Fallback: generate ephemeral secret (won't survive restarts, but won't crash)
      machineSecret = crypto.randomBytes(32).toString('hex');
    }

    // 2. Windows Machine GUID (additional entropy, not available on other OSes)
    let windowsGuid = '';
    if (os.platform() === 'win32') {
      try {
        const result = execSync(
          'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
          { encoding: 'utf8', timeout: 5000 }
        );
        const match = result.match(/MachineGuid\s+REG_SZ\s+(.+)/);
        if (match) windowsGuid = match[1].trim();
      } catch {
        // Not critical — falls back to other factors
      }
    }

    // 3. Combine all factors
    const factors = [
      machineSecret,
      windowsGuid,
      os.hostname(),
      os.platform(),
      os.arch(),
    ].join('|');

    return crypto.createHash('sha256').update(factors).digest('hex').substring(0, 32);
  }

  /**
   * Get the current device ID
   */
  getDeviceId(): string {
    return this.deviceId || this.generateDeviceId();
  }

  // ==========================================================================
  // License Validation
  // ==========================================================================

  /**
   * Validate a license key
   */
  async validateLicense(
    key: string,
    deviceId?: string,
    platform: string = 'desktop'
  ): Promise<LicenseResult> {
    const effectiveDeviceId = deviceId || this.deviceId || this.generateDeviceId();

    console.log(`[LicenseManager] Validating license for device ${effectiveDeviceId.substring(0, 8)}...`);

    try {
      // Use embedded API server format
      const body = {
        license_key: key.toUpperCase(),
        device_id: effectiveDeviceId,
        instance_name: `${os.hostname()}-${effectiveDeviceId.substring(0, 6)}`,
        platform,
      };

      const response = await fetch(LICENSE_VALIDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `HedgeEdge/${app.getVersion()}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log(`[LicenseManager] Validation failed: ${data.message || data.error}`);
        return {
          valid: false,
          message: data.message || data.error || `HTTP ${response.status}`,
        };
      }

      const valid = data.valid === true;
      const result: LicenseResult = {
        valid,
        token: data.token,
        ttlSeconds: data.ttlSeconds,
        message: data.message || data.error,
        plan: data.plan || data.tier,
        tier: data.plan || data.tier,
        expiresAt: data.expiresAt || data.expires_at,
        features: data.features,
        email: data.email,
        maxDevices: data.maxDevices,
        currentDevices: data.currentDevices,
      };

      if (result.valid) {
        if (result.token) {
          this.cacheLicense(result);
          this.scheduleTokenRefresh(result.ttlSeconds || 3600);
        }

        await licenseStore.activate(key);

        // Persist instance_id for future deactivation
        const instanceId = data.instance?.id || data.instanceId || data.instance_id;
        if (instanceId) {
          licenseStore.setInstanceId(instanceId);
        }

        this.checkExpiryWarning(result.expiresAt);
        this.emitLicenseChange('validated', result);
      }

      return result;
    } catch (error) {
      console.error('[LicenseManager] Validation error:', error);
      return {
        valid: false,
        message: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Refresh the current session token
   */
  async refreshToken(token?: string): Promise<RefreshResult> {
    const currentToken = token || this.cachedLicense?.token;
    const licenseKey = licenseStore.getLicenseKey();

    if (!currentToken && !licenseKey) {
      return {
        success: false,
        error: 'No license to refresh',
      };
    }

    console.log('[LicenseManager] Refreshing token...');

    try {
      // Re-validate with the stored key
      if (licenseKey) {
        const result = await this.validateLicense(licenseKey);
        if (result.valid) {
          return {
            success: true,
            token: result.token,
            ttlSeconds: result.ttlSeconds,
            message: 'Token refreshed successfully',
          };
        }
        return {
          success: false,
          error: result.message || 'Refresh failed',
        };
      }

      return {
        success: false,
        error: 'No stored license key',
      };
    } catch (error) {
      console.error('[LicenseManager] Refresh error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refresh failed',
      };
    }
  }

  /**
   * Refresh license status from API
   */
  async refreshLicense(): Promise<{ success: boolean; info?: LicenseInfo; error?: string }> {
    const licenseKey = licenseStore.getLicenseKey();

    if (!licenseKey) {
      return { success: false, error: 'No license configured' };
    }

    const result = await this.validateLicense(licenseKey);

    if (result.valid) {
      return {
        success: true,
        info: this.getLicenseStatus(),
      };
    }

    return {
      success: false,
      error: result.message,
    };
  }

  // ==========================================================================
  // Device Management
  // ==========================================================================

  /**
   * Deactivate a device from the license via the Railway backend
   */
  async deactivateDevice(key: string, deviceId: string): Promise<boolean> {
    const instanceId = licenseStore.getInstanceId();
    if (!instanceId) {
      console.warn('[LicenseManager] No instance_id stored — cannot deactivate');
      return false;
    }

    console.log(`[LicenseManager] Deactivating device ${deviceId.substring(0, 8)} (instance: ${instanceId.substring(0, 8)})...`);

    try {
      const railwayBase = process.env.HEDGE_EDGE_LICENSE_API_URL
        || 'https://hedgeedge-railway-backend-production.up.railway.app';

      const response = await fetch(`${railwayBase}/v1/license/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `HedgeEdge/${app.getVersion()}`,
        },
        body: JSON.stringify({
          licenseKey: key.toUpperCase().trim(),
          deviceId,
          instanceId,
        }),
      });

      if (response.ok) {
        console.log('[LicenseManager] Device deactivated successfully');
        licenseStore.setInstanceId('');
        return true;
      }

      const errorData = await response.json().catch(() => ({}));
      console.warn(`[LicenseManager] Deactivation failed (${response.status}):`, errorData.message || 'Unknown error');
      return false;
    } catch (error) {
      console.error('[LicenseManager] Deactivation error:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Get list of registered devices
   * Returns the current device plus any connected agents as a best-effort list.
   * Full device enumeration is not yet available.
   */
  async getRegisteredDevices(): Promise<DeviceInfo[]> {
    const devices: DeviceInfo[] = [];

    // Always include the current device
    const currentDeviceId = this.getDeviceId();
    devices.push({
      deviceId: currentDeviceId,
      platform: 'desktop',
      name: os.hostname(),
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      version: app.getVersion(),
      isCurrentDevice: true,
    });

    // Include connected agents as additional devices
    for (const agent of this.connectedAgents.values()) {
      devices.push({
        deviceId: agent.id,
        platform: agent.platform,
        name: `${agent.platform}/${agent.accountId}`,
        registeredAt: agent.connectedAt.toISOString(),
        lastSeenAt: agent.lastHeartbeat.toISOString(),
        isCurrentDevice: false,
      });
    }

    return devices;
  }

  // ==========================================================================
  // License Status
  // ==========================================================================

  /**
   * Get current license status
   */
  getLicenseStatus(): LicenseInfo {
    const storeStatus = licenseStore.getStatus();

    // Enhance with cached data
    if (this.cachedLicense) {
      return {
        ...storeStatus,
        tier: this.cachedLicense.license.tier || this.cachedLicense.license.plan,
        plan: this.cachedLicense.license.plan,
        features: this.cachedLicense.license.features,
        email: this.cachedLicense.license.email,
      };
    }

    return storeStatus;
  }

  /**
   * Check if license is valid
   */
  isLicenseValid(): boolean {
    const status = this.getLicenseStatus();
    return status.status === 'valid';
  }

  /**
   * Get cached token for agent authentication
   */
  getCachedToken(): string | null {
    if (!this.cachedLicense || Date.now() > this.cachedLicense.expiresAt) {
      return null;
    }
    return this.cachedLicense.token;
  }

  // ==========================================================================
  // Agent Connection Management
  // ==========================================================================

  /**
   * Register a connected agent/terminal
   */
  registerAgent(agentId: string, platform: 'mt5' | 'mt4' | 'ctrader', accountId: string): void {
    const agent: ConnectedAgent = {
      id: agentId,
      platform,
      accountId,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.connectedAgents.set(agentId, agent);
    console.log(`[LicenseManager] Agent registered: ${platform}/${accountId}`);

    this.emit('device:connected', agent);
  }

  /**
   * Update agent heartbeat
   */
  updateAgentHeartbeat(agentId: string): void {
    const agent = this.connectedAgents.get(agentId);
    if (agent) {
      agent.lastHeartbeat = new Date();
      this.connectedAgents.set(agentId, agent);
    }
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.connectedAgents.get(agentId);
    if (agent) {
      this.connectedAgents.delete(agentId);
      console.log(`[LicenseManager] Agent unregistered: ${agent.platform}/${agent.accountId}`);
      this.emit('device:disconnected', agent);
    }
  }

  /**
   * Get list of connected agents
   */
  getConnectedAgents(): ConnectedAgent[] {
    return Array.from(this.connectedAgents.values());
  }

  /**
   * Broadcast license state to all connected agents
   */
  broadcastLicenseState(): void {
    const state = {
      valid: this.isLicenseValid(),
      token: this.getCachedToken(),
      status: this.getLicenseStatus(),
    };

    this.emit('broadcast:license', state);
  }

  // ==========================================================================
  // Event Subscription
  // ==========================================================================

  /**
   * Subscribe to license state changes
   */
  onLicenseChange(callback: (event: LicenseStateEvent) => void): () => void {
    const handler = (event: LicenseStateEvent) => callback(event);
    this.on('license:change', handler);
    return () => this.off('license:change', handler);
  }

  /**
   * Subscribe to expiry warnings
   */
  onExpiryWarning(callback: (hoursRemaining: number) => void): () => void {
    const handler = (hours: number) => callback(hours);
    this.on('license:warning', handler);
    return () => this.off('license:warning', handler);
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Cache a validated license
   */
  private cacheLicense(result: LicenseResult): void {
    if (!result.token) return;

    const now = Date.now();
    const ttlMs = (result.ttlSeconds || 3600) * 1000;

    this.cachedLicense = {
      license: result,
      token: result.token,
      cachedAt: now,
      expiresAt: now + ttlMs,
      refreshAt: now + ttlMs - TOKEN_REFRESH_BUFFER_MS,
    };

    console.log(`[LicenseManager] License cached, expires in ${result.ttlSeconds}s`);
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(ttlSeconds: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshInMs = Math.max((ttlSeconds - 300) * 1000, 60000); // At least 1 minute

    this.refreshTimer = setTimeout(async () => {
      console.log('[LicenseManager] Auto-refreshing token...');
      const result = await this.refreshToken();
      if (result.success) {
        this.emit('token:refreshed', result.token);
      }
    }, refreshInMs);

    console.log(`[LicenseManager] Token refresh scheduled in ${Math.round(refreshInMs / 1000)}s`);
  }

  /**
   * Check if license expiry warning should be shown
   */
  private checkExpiryWarning(expiresAt?: string): void {
    if (!expiresAt) return;

    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const hoursRemaining = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursRemaining <= EXPIRY_WARNING_HOURS && hoursRemaining > 0) {
      console.log(`[LicenseManager] License expires in ${Math.round(hoursRemaining)} hours`);
      this.emit('license:warning', Math.round(hoursRemaining));
    }
  }

  /**
   * Start periodic background checks
   */
  private startPeriodicChecks(): void {
    // Device heartbeat check - remove stale agents
    this.deviceCheckTimer = setInterval(() => {
      const staleThreshold = Date.now() - (5 * 60 * 1000); // 5 minutes
      for (const [agentId, agent] of this.connectedAgents) {
        if (agent.lastHeartbeat.getTime() < staleThreshold) {
          console.log(`[LicenseManager] Removing stale agent: ${agentId}`);
          this.unregisterAgent(agentId);
        }
      }
    }, DEVICE_CHECK_INTERVAL_MS);
  }

  /**
   * Stop periodic checks
   */
  private stopPeriodicChecks(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.deviceCheckTimer) {
      clearInterval(this.deviceCheckTimer);
      this.deviceCheckTimer = null;
    }
  }

  /**
   * Emit license change event
   */
  private emitLicenseChange(
    type: LicenseStateEvent['type'],
    result?: LicenseResult,
    error?: string
  ): void {
    const event: LicenseStateEvent = {
      type,
      license: this.getLicenseStatus(),
      devices: this.getConnectedAgents().map(a => ({
        deviceId: a.id,
        platform: a.platform,
        registeredAt: a.connectedAt.toISOString(),
        lastSeenAt: a.lastHeartbeat.toISOString(),
        isCurrentDevice: false,
      })),
      error,
    };

    this.emit('license:change', event);
    this.broadcastLicenseState();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const licenseManager = new LicenseManager();
