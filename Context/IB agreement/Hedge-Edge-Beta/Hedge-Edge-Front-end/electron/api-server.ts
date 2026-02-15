/**
 * Embedded License API Server for HedgeEdge Desktop App
 * 
 * Runs on localhost:3002 to provide license validation endpoint.
 * Proxies requests to the Railway-hosted backend — NEVER calls Creem directly.
 * All payment/subscription logic stays server-side on Railway.
 * 
 * Endpoints:
 * - POST /api/validate-license (validate a license key via Railway backend)
 * - GET /api/health (server health check)
 */

import express, { Express, Request, Response } from 'express';
import { app as electronApp } from 'electron';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

// Get the directory of this file for finding .env.desktop
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.desktop in the electron directory
const envPath = path.join(__dirname, '.env.desktop');
console.log(`[APIServer] Loading env from: ${envPath}`);
loadEnv({ path: envPath, override: false });

// ============================================================================
// Types
// ============================================================================

interface ValidateLicenseRequest {
  license_key: string;
  device_id: string;
  instance_name?: string;
  platform?: string;
}

interface ValidateLicenseResponse {
  valid: boolean;
  status?: string;
  tier?: string;
  plan?: string;
  expiresAt?: string;
  token?: string;
  ttlSeconds?: number;
  message?: string;
  error?: string;
  features?: string[];
  maxDevices?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const API_PORT = 3002;

// Railway backend — the ONLY upstream for license validation.
// Desktop app NEVER talks to Creem directly (secrets stay server-side).
const RAILWAY_BACKEND_URL = process.env.HEDGE_EDGE_LICENSE_API_URL
  || 'https://hedgeedge-railway-backend-production.up.railway.app';

console.log(`[APIServer] Railway backend: ${RAILWAY_BACKEND_URL}`);

// --- Log masking utility ---
function maskKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return `****${key.slice(-4)}`;
}

// --- Simple rate limiter for local API ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return true; // rate limited
  }
  return false;
}

// --- API nonce authentication ---
const API_NONCE = crypto.randomBytes(16).toString('hex');

function writeNonceFile(): void {
  try {
    const noncePath = path.join(electronApp.getPath('userData'), '.api-nonce');
    fs.writeFileSync(noncePath, API_NONCE, { mode: 0o600 });
  } catch (err) {
    console.error('[API Server] Failed to write nonce file');
  }
}

// ============================================================================
// Express Server Setup
// ============================================================================

export class LicenseAPIServer extends EventEmitter {
  private server: Express;
  private httpServer: any = null;
  private isRunning = false;

  constructor() {
    super();
    this.server = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.server.use(express.json());

    // Request logging
    this.server.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[APIServer] ${timestamp} ${req.method} ${req.path}`);
      next();
    });

    // Nonce authentication middleware
    this.server.use((req, res, next) => {
      // Allow health endpoint without nonce
      if (req.path === '/api/health') return next();

      const nonce = req.headers['x-api-nonce'] as string;
      if (!nonce || nonce !== API_NONCE) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      next();
    });

    // Rate limiting middleware
    this.server.use((req, res, next) => {
      const endpoint = req.path;
      const isStrict = ['/api/validate-license', '/api/activate'].includes(endpoint);
      const maxReq = isStrict ? 5 : 15;

      if (rateLimit(endpoint, maxReq, 60_000)) {
        return res.status(429).json({ error: 'Too many requests, try again later' });
      }
      next();
    });
  }

  private setupRoutes() {
    // Health check endpoint
    this.server.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: electronApp.getVersion(),
      });
    });

    // License validation endpoint — proxies to Railway backend
    this.server.post('/api/validate-license', async (req: Request, res: Response) => {
      try {
        const { license_key, device_id, instance_name, platform } = req.body as ValidateLicenseRequest;

        if (!license_key) {
          return res.status(400).json({
            valid: false,
            error: 'license_key is required',
          });
        }

        if (!device_id) {
          return res.status(400).json({
            valid: false,
            error: 'device_id is required',
          });
        }

        // Proxy to Railway backend
        const result = await this.validateViaRailway(license_key, device_id, instance_name, platform);
        const statusCode = result.valid ? 200 : (result.error?.includes('required') ? 400 : 403);
        res.status(statusCode).json(result);
      } catch (error) {
        console.error('[APIServer] Validation error:', error);
        res.status(500).json({
          valid: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        });
      }
    });

    // Error handling middleware (must be after all routes)
    this.server.use((err: any, _req: Request, res: Response, _next: any) => {
      console.error('[APIServer] Error:', err);
      res.status(500).json({
        valid: false,
        error: 'Internal server error',
      });
    });
  }

  /**
   * Validate license by proxying to the Railway-hosted backend.
   * Railway handles all Creem/payment logic — we just forward the request.
   */
  private async validateViaRailway(
    licenseKey: string,
    deviceId: string,
    instanceName?: string,
    platform?: string
  ): Promise<ValidateLicenseResponse> {
    const normalizedKey = licenseKey.toUpperCase().trim();
    const effectiveInstanceName = instanceName || `HedgeEdge-${deviceId.substring(0, 8)}`;

    try {
      const url = `${RAILWAY_BACKEND_URL}/v1/license/validate`;
      const payload = {
        licenseKey: normalizedKey,
        deviceId,
        instanceName: effectiveInstanceName,
        platform: platform || 'desktop',
      };

      console.log(`[APIServer] Validating via Railway: key=${maskKey(normalizedKey)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `HedgeEdge-Desktop/${electronApp.getVersion()}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as any;
      console.log(`[APIServer] Railway response: status=${response.status}, valid=${data.valid}`);

      return {
        valid: data.valid === true,
        status: data.status,
        tier: data.tier || data.plan,
        plan: data.plan || data.tier,
        expiresAt: data.expiresAt || data.expires_at,
        token: data.token,
        ttlSeconds: data.ttlSeconds,
        message: data.message || data.error,
        features: data.features,
        maxDevices: data.maxDevices,
      };
    } catch (error) {
      console.error('[APIServer] Railway request failed:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Network error — could not reach license server',
      };
    }
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.server.listen(API_PORT, 'localhost', () => {
          this.isRunning = true;
          writeNonceFile();
          console.log(`[APIServer] License API server started on http://localhost:${API_PORT}`);
          this.emit('started');
          resolve();
        });
      } catch (error) {
        console.error('[APIServer] Failed to start:', error);
        this.emit('error', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.httpServer) {
        resolve();
        return;
      }

      this.httpServer.close(() => {
        this.isRunning = false;
        console.log('[APIServer] License API server stopped');
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  running(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const licenseAPIServer = new LicenseAPIServer();
