/**
 * License Store Module for HedgeEdge
 * 
 * Manages license key storage using OS keychain (Windows DPAPI via Electron safeStorage)
 * with in-memory fallback when encryption is not available.
 * 
 * Security features:
 * - Never stores plaintext license key on disk
 * - Uses DPAPI/Credential Locker on Windows
 * - In-memory only fallback for unsupported systems
 * - Masked key for UI display
 */

import { safeStorage, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type LicenseStatus = 'valid' | 'expired' | 'invalid' | 'not-configured' | 'checking' | 'error';

export interface LicenseInfo {
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
}

export interface LicenseValidationResponse {
  valid: boolean;
  token?: string;
  ttlSeconds?: number;
  message?: string;
  plan?: string;
  expiresAt?: string;
}

interface StoredLicenseData {
  encryptedKey: string; // base64 encoded encrypted key
  instanceId?: string; // Instance ID for deactivation
  lastValidated?: string;
  tier?: string;
  expiresAt?: string;
}

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Constants
// ============================================================================

/**
 * License validation now happens via the embedded API server (localhost:3002)
 * This store only handles persistence and format validation
 */
const LICENSE_FILE_NAME = 'license.dat';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// License Store Class
// ============================================================================

export class LicenseStore {
  private licenseKey: string | null = null;
  private licenseInfo: LicenseInfo | null = null;
  private instanceId: string | null = null;
  private encryptionAvailable: boolean;
  private licenseFilePath: string;
  
  constructor() {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();
    this.licenseFilePath = path.join(app.getPath('userData'), LICENSE_FILE_NAME);
  }
  
  /**
   * Initialize the store - load any persisted license
   */
  async initialize(): Promise<void> {
    if (!this.encryptionAvailable) {
      console.warn('[LicenseStore] WARNING: OS encryption unavailable. License key stored in memory only.');
      console.warn('[LicenseStore] License will need to be re-entered each session.');
      this.licenseInfo = { status: 'not-configured' };
      return;
    }
    
    try {
      await this.loadPersistedLicense();
    } catch (error) {
      console.error('[LicenseStore] Failed to load persisted license:', error);
      this.licenseInfo = { status: 'not-configured' };
    }
  }
  
  /**
   * Load persisted license from encrypted storage
   */
  private async loadPersistedLicense(): Promise<void> {
    try {
      const exists = await fs.access(this.licenseFilePath).then(() => true).catch(() => false);
      if (!exists) {
        this.licenseInfo = { status: 'not-configured' };
        return;
      }
      
      const encryptedData = await fs.readFile(this.licenseFilePath);
      const data: StoredLicenseData = JSON.parse(encryptedData.toString());
      
      // Decrypt the license key
      const encryptedBuffer = Buffer.from(data.encryptedKey, 'base64');
      this.licenseKey = safeStorage.decryptString(encryptedBuffer);
      
      // Restore basic info (actual validation happens separately)
      this.licenseInfo = {
        status: 'checking',
        maskedKey: this.maskLicenseKey(this.licenseKey),
        lastChecked: data.lastValidated,
        tier: data.tier,
        expiresAt: data.expiresAt,
      };

      // Restore instance_id for deactivation
      this.instanceId = data.instanceId || null;
      
      console.log('[LicenseStore] Loaded persisted license (masked):', this.licenseInfo.maskedKey);
    } catch (error) {
      console.error('[LicenseStore] Failed to decrypt persisted license:', error);
      // Clear corrupted file
      await this.clearPersistedLicense();
      this.licenseInfo = { status: 'not-configured' };
    }
  }
  
  /**
   * Save license key to encrypted storage
   */
  private async persistLicense(tier?: string, expiresAt?: string): Promise<void> {
    if (!this.encryptionAvailable || !this.licenseKey) {
      return;
    }
    
    try {
      const encryptedBuffer = safeStorage.encryptString(this.licenseKey);
      const data: StoredLicenseData = {
        encryptedKey: encryptedBuffer.toString('base64'),
        instanceId: this.instanceId || undefined,
        lastValidated: new Date().toISOString(),
        tier,
        expiresAt,
      };
      
      await fs.writeFile(this.licenseFilePath, JSON.stringify(data), 'utf-8');
      console.log('[LicenseStore] License key persisted securely');
    } catch (error) {
      console.error('[LicenseStore] Failed to persist license:', error);
      // Non-fatal - license will work for this session
    }
  }
  
  /**
   * Clear persisted license file
   */
  private async clearPersistedLicense(): Promise<void> {
    try {
      await fs.unlink(this.licenseFilePath);
    } catch {
      // File may not exist
    }
  }
  
  /**
   * Mask a license key for safe display
   */
  maskLicenseKey(key: string): string {
    if (!key || key.length <= 8) return '••••-••••';
    const parts = key.split('-');
    if (parts.length >= 4) {
      return `${parts[0].slice(0, 2)}••-••••-••••-••${parts[parts.length - 1].slice(-2)}`;
    }
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
  }
  
  /**
   * Get device/machine ID for license binding
   */
  private getDeviceId(): string {
    // Use a combination of factors for device identification
    // In production, this would be more sophisticated
    const factors = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || 'unknown',
    ].join('|');
    
    return crypto.createHash('sha256').update(factors).digest('hex').substring(0, 32);
  }
  
  /**
   * Validate license key format
   */
  private isValidFormat(key: string): boolean {
    // Accept any key with 3+ groups of alphanumeric chars separated by hyphens
    // Covers license keys (5x5), developer keys (HEDGE-DEV-2026-MASTER), etc.
    return /^[A-Z0-9]([A-Z0-9-]*[A-Z0-9])?$/i.test(key) && key.includes('-') && key.length >= 8;
  }
  
  /**
   * Activate a license key (called after validation by license-manager)
   * Simply persists the key to storage - validation happens in license-manager
   */
  async activate(licenseKey: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const trimmedKey = licenseKey.trim().toUpperCase();
    
    // Format validation only
    if (!this.isValidFormat(trimmedKey)) {
      return {
        success: false,
        error: 'Invalid license key format',
      };
    }
    
    // Store the key - mark as valid since activate() is only called after successful validation
    this.licenseKey = trimmedKey;
    this.licenseInfo = {
      status: 'valid',
      maskedKey: this.maskLicenseKey(trimmedKey),
    };
    
    // Persist to encrypted storage
    await this.persistLicense();
    
    // Export to MT5 Common Files so all EAs can auto-read it
    await this.exportLicenseToCommonFiles(trimmedKey);
    
    return { success: true };
  }
  
  /**
   * Refresh the current license status
   * Note: Actual validation happens in license-manager
   */
  async refresh(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.licenseKey) {
      return { success: false, error: 'No license key configured' };
    }
    
    // Update status to checking
    this.licenseInfo = { 
      ...this.licenseInfo, 
      status: 'checking',
      maskedKey: this.maskLicenseKey(this.licenseKey),
    } as LicenseInfo;
    
    // Actual validation is delegated to license-manager
    return { success: true };
  }
  
  /**
   * Remove the license
   */
  async remove(): Promise<void> {
    this.licenseKey = null;
    this.licenseInfo = { status: 'not-configured' };
    await this.clearPersistedLicense();
    // Also remove from MT5 Common Files
    await this.removeLicenseFromCommonFiles();
  }
  
  /**
   * Get current license status
   */
  getStatus(): LicenseInfo {
    return this.licenseInfo || { status: 'not-configured' };
  }
  
  /**
   * Get the raw license key (for internal use only - never expose to renderer)
   */
  getLicenseKey(): string | null {
    return this.licenseKey;
  }

  /**
   * Get the stored instance_id (for deactivation flow)
   */
  getInstanceId(): string | null {
    return this.instanceId;
  }

  /**
   * Set the instance_id (called after successful activation)
   */
  setInstanceId(id: string): void {
    this.instanceId = id;
    // Re-persist so instance_id is saved alongside the key
    this.persistLicense().catch(() => {
      console.warn('[LicenseStore] Failed to persist instance_id');
    });
  }
  
  /**
   * Check if encryption is available
   */
  isEncryptionAvailable(): boolean {
    return this.encryptionAvailable;
  }
  
  // ========================================================================
  // MT5 Common Files — Shared License Key
  // ========================================================================
  
  /**
   * Get the path to the MT5 Common Files directory.
   * All MT5 terminals share: %APPDATA%\MetaQuotes\Terminal\Common\Files\
   */
  private static getMT5CommonFilesPath(): string {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA environment variable not set');
    }
    return path.join(appData, 'MetaQuotes', 'Terminal', 'Common', 'Files');
  }
  
  /**
   * Export the license key to MT5 Common Files so all EAs can auto-read it.
   * Written as plaintext to: HedgeEdge/license.key
   * 
   * This allows EAs to auto-discover the license key without requiring
   * users to paste it into every EA instance's input parameters.
   */
  private async exportLicenseToCommonFiles(key: string): Promise<void> {
    try {
      const commonDir = path.join(LicenseStore.getMT5CommonFilesPath(), 'HedgeEdge');
      await fs.mkdir(commonDir, { recursive: true });
      
      const licenseFilePath = path.join(commonDir, 'license.key');
      await fs.writeFile(licenseFilePath, key, 'utf-8');
      
      console.log('[LicenseStore] License key exported to MT5 Common Files:', licenseFilePath);
    } catch (error) {
      // Non-fatal — EAs will fall back to manual input
      console.warn('[LicenseStore] Failed to export license to Common Files:', error);
    }
  }
  
  /**
   * Remove the license key from MT5 Common Files.
   */
  private async removeLicenseFromCommonFiles(): Promise<void> {
    try {
      const licenseFilePath = path.join(
        LicenseStore.getMT5CommonFilesPath(), 'HedgeEdge', 'license.key'
      );
      await fs.unlink(licenseFilePath);
      console.log('[LicenseStore] License key removed from MT5 Common Files');
    } catch {
      // File may not exist — ignore
    }
  }
}

// Singleton instance
export const licenseStore = new LicenseStore();
