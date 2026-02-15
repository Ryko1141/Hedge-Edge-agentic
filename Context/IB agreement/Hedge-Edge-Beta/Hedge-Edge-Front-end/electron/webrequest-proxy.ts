/**
 * WebRequest Proxy Server for MT5 License Validation
 * 
 * Local HTTP proxy that intercepts MT5 WebRequest calls and provides:
 * - Local caching to reduce API latency
 * - Offline mode with cached tokens
 * - Authentication header injection
 * - Request logging for debugging
 * 
 * Port: 8089 (configurable)
 * 
 * This is an OPTIONAL fallback mechanism. Primary communication is via ZMQ.
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';
import { EventEmitter } from 'events';
import { licenseManager } from './license-manager.js';
import { licenseStore } from './license-store.js';
import { portManager } from './port-manager.js';

// ============================================================================
// Types
// ============================================================================

export interface WebRequestProxyConfig {
  port: number;
  host: string;
  apiBaseUrl: string;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  offlineModeEnabled: boolean;
  logRequests: boolean;
}

interface CachedResponse {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
  cachedAt: number;
  expiresAt: number;
}

interface ProxyRequest {
  id: string;
  method: string;
  path: string;
  timestamp: Date;
  clientIp: string;
  cached: boolean;
  responseTime?: number;
  statusCode?: number;
}

export interface ProxyStatus {
  running: boolean;
  port: number;
  requestsServed: number;
  cacheHits: number;
  cacheMisses: number;
  lastRequest?: ProxyRequest;
  uptime?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: WebRequestProxyConfig = {
  port: 9089,
  host: '127.0.0.1',
  apiBaseUrl: process.env.VITE_SUPABASE_URL || '',
  cacheEnabled: true,
  cacheTtlSeconds: 300, // 5 minutes
  offlineModeEnabled: true,
  logRequests: true,
};

// ============================================================================
// WebRequest Proxy Class
// ============================================================================

/**
 * Local HTTP Proxy for MT5 WebRequest Interception
 * 
 * Events:
 * - 'request' - New request received
 * - 'response' - Response sent
 * - 'cache:hit' - Response served from cache
 * - 'cache:miss' - Cache miss, forwarding to API
 * - 'error' - Error occurred
 */
export class WebRequestProxy extends EventEmitter {
  private config: WebRequestProxyConfig;
  private server: http.Server | null = null;
  private cache: Map<string, CachedResponse> = new Map();
  private requestLog: ProxyRequest[] = [];
  private requestCounter = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private startTime: Date | null = null;

  constructor(config: Partial<WebRequestProxyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Server Lifecycle
  // ==========================================================================

  /**
   * Start the proxy server.
   * 
   * IMPROVED: Retries with fallback ports on EADDRINUSE, and registers the
   * actual port with the central PortManager for conflict tracking.
   */
  async start(): Promise<boolean> {
    if (this.server) {
      console.log('[WebRequestProxy] Server already running');
      return true;
    }

    // Use PortManager to find an available port with fallback
    const allocatedPort = await portManager.allocateProxyPort(this.config.port);
    if (allocatedPort === null) {
      console.error(`[WebRequestProxy] No available port found in range. Cannot start proxy.`);
      this.emit('error', new Error('No available port for WebRequest proxy'));
      return false;
    }
    
    // Update config to use the allocated port
    const actualPort = allocatedPort;
    if (actualPort !== this.config.port) {
      console.log(`[WebRequestProxy] Preferred port ${this.config.port} unavailable, using fallback port ${actualPort}`);
    }

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        console.error('[WebRequestProxy] Server error:', err.code, err.message);
        
        // Specific handling for EADDRINUSE (port stolen between allocate and listen)
        if (err.code === 'EADDRINUSE') {
          console.error(`[WebRequestProxy] Port ${actualPort} became unavailable after allocation — a race condition occurred`);
          portManager.release(actualPort);
        }
        
        this.server = null;
        this.emit('error', err);
        resolve(false);
      });

      this.server.listen(actualPort, this.config.host, () => {
        this.config.port = actualPort;
        this.startTime = new Date();
        portManager.markVerified(actualPort);
        console.log(`[WebRequestProxy] Server started on http://${this.config.host}:${actualPort}`);
        this.emit('started', { port: actualPort, host: this.config.host });
        resolve(true);
      });
    });
  }

  /**
   * Stop the proxy server and release the port allocation.
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const port = this.config.port;
    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log('[WebRequestProxy] Server stopped');
        this.server = null;
        this.startTime = null;
        portManager.release(port);
        this.emit('stopped');
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get server status
   */
  getStatus(): ProxyStatus {
    return {
      running: this.isRunning(),
      port: this.config.port,
      requestsServed: this.requestCounter,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      lastRequest: this.requestLog[this.requestLog.length - 1],
      uptime: this.startTime ? Date.now() - this.startTime.getTime() : undefined,
    };
  }

  // ==========================================================================
  // Request Handling
  // ==========================================================================

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const requestId = `req_${++this.requestCounter}`;
    const startTime = Date.now();
    const clientIp = req.socket.remoteAddress || 'unknown';
    const method = req.method || 'GET';
    const url = req.url || '/';

    // Log request
    const proxyRequest: ProxyRequest = {
      id: requestId,
      method,
      path: url,
      timestamp: new Date(),
      clientIp,
      cached: false,
    };

    if (this.config.logRequests) {
      console.log(`[WebRequestProxy] ${requestId} ${method} ${url} from ${clientIp}`);
    }

    this.emit('request', proxyRequest);

    try {
      // Handle CORS preflight
      if (method === 'OPTIONS') {
        this.sendCorsResponse(res);
        return;
      }

      // Route the request
      if (url.startsWith('/v1/license/validate')) {
        await this.handleLicenseValidation(req, res, requestId);
      } else if (url.startsWith('/v1/license/status')) {
        await this.handleLicenseStatus(req, res, requestId);
      } else if (url === '/health' || url === '/') {
        this.sendHealthCheck(res);
      } else {
        // Forward to actual API
        await this.forwardRequest(req, res, requestId);
      }

      // Update request log
      proxyRequest.responseTime = Date.now() - startTime;
      proxyRequest.statusCode = res.statusCode;
      this.requestLog.push(proxyRequest);

      // Keep only last 100 requests
      if (this.requestLog.length > 100) {
        this.requestLog.shift();
      }

      this.emit('response', proxyRequest);
    } catch (error) {
      console.error(`[WebRequestProxy] ${requestId} Error:`, error);
      this.sendError(res, 500, 'Internal proxy error');
      this.emit('error', { requestId, error });
    }
  }

  /**
   * Handle license validation request
   */
  private async handleLicenseValidation(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string
  ): Promise<void> {
    // Parse request body
    let body: string;
    try {
      body = await this.readRequestBody(req);
    } catch (err: any) {
      if (err.message === 'Request body too large') {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }
      throw err;
    }
    
    try {
      const data = JSON.parse(body);
      const cacheKey = this.generateCacheKey('/v1/license/validate', data);

      // Check cache first
      if (this.config.cacheEnabled) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          this.cacheHits++;
          this.emit('cache:hit', { requestId, cacheKey });
          this.sendCachedResponse(res, cached);
          return;
        }
      }

      this.cacheMisses++;
      this.emit('cache:miss', { requestId, cacheKey });

      // Use LicenseManager to validate
      const result = await licenseManager.validateLicense(
        data.licenseKey,
        data.deviceId,
        data.platform || 'mt5'
      );

      const responseBody = JSON.stringify({
        valid: result.valid,
        token: result.token,
        ttlSeconds: result.ttlSeconds,
        message: result.message,
        plan: result.plan,
        expiresAt: result.expiresAt,
        features: result.features,
      });

      // Cache successful responses
      if (result.valid && this.config.cacheEnabled) {
        this.addToCache(cacheKey, responseBody, result.ttlSeconds || 300);
      }

      this.setCorsHeaders(res);
      res.writeHead(result.valid ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(responseBody);
    } catch (parseError) {
      this.sendError(res, 400, 'Invalid JSON request body');
    }
  }

  /**
   * Handle license status request
   */
  private async handleLicenseStatus(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    _requestId: string
  ): Promise<void> {
    const status = licenseManager.getLicenseStatus();

    const responseBody = JSON.stringify({
      status: 'online',
      timestamp: new Date().toISOString(),
      proxy: true,
      license: {
        status: status.status,
        tier: status.tier,
        expiresAt: status.expiresAt,
      },
    });

    this.setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseBody);
  }

  /**
   * Forward request to actual API
   */
  private async forwardRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    requestId: string
  ): Promise<void> {
    const targetUrl = new URL(req.url || '/', this.config.apiBaseUrl);
    let body: string | undefined;
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        body = await this.readRequestBody(req);
      } catch (err: any) {
        if (err.message === 'Request body too large') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          return;
        }
        throw err;
      }
    }

    // Check cache for GET requests
    if (req.method === 'GET' && this.config.cacheEnabled) {
      const cacheKey = this.generateCacheKey(req.url || '/');
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.cacheHits++;
        this.sendCachedResponse(res, cached);
        return;
      }
      this.cacheMisses++;
    }

    // Forward to actual API
    const proxyRes = await this.makeHttpsRequest(targetUrl, {
      method: req.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HedgeEdge-Proxy/1.0',
        'X-Forwarded-For': req.socket.remoteAddress || 'unknown',
        'X-Request-ID': requestId,
      },
      body,
    });

    // Cache successful GET responses
    if (req.method === 'GET' && proxyRes.statusCode === 200 && this.config.cacheEnabled) {
      const cacheKey = this.generateCacheKey(req.url || '/');
      this.addToCache(cacheKey, proxyRes.body);
    }

    this.setCorsHeaders(res);
    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
    res.end(proxyRes.body);
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Generate cache key
   */
  private generateCacheKey(path: string, data?: Record<string, unknown>): string {
    const baseKey = path;
    if (data) {
      // Include relevant data in cache key
      const keyData = {
        licenseKey: data.licenseKey,
        deviceId: data.deviceId,
        platform: data.platform,
      };
      return `${baseKey}:${JSON.stringify(keyData)}`;
    }
    return baseKey;
  }

  /**
   * Get cached response
   */
  private getFromCache(key: string): CachedResponse | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Add response to cache
   */
  private addToCache(key: string, body: string, ttlSeconds: number = 300): void {
    const now = Date.now();
    this.cache.set(key, {
      body,
      headers: { 'Content-Type': 'application/json' },
      statusCode: 200,
      cachedAt: now,
      expiresAt: now + (ttlSeconds * 1000),
    });
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  // ==========================================================================
  // HTTP Helpers
  // ==========================================================================

  /**
   * Read request body
   */
  private static readonly MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB

  private readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      let totalSize = 0;
      req.on('data', (chunk: Buffer | string) => {
        totalSize += Buffer.byteLength(chunk);
        if (totalSize > WebRequestProxy.MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Make HTTPS request
   */
  private makeHttpsRequest(
    url: URL,
    options: { method: string; headers: Record<string, string>; body?: string }
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: options.method,
        headers: options.headers,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            body,
          });
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  /**
   * Set CORS headers.
   * Restricted to localhost origins only (was previously '*' which allowed
   * any local process or browser-based XSS to probe the proxy).
   */
  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  /**
   * Send CORS preflight response
   */
  private sendCorsResponse(res: http.ServerResponse): void {
    this.setCorsHeaders(res);
    res.writeHead(204);
    res.end();
  }

  /**
   * Send cached response
   */
  private sendCachedResponse(res: http.ServerResponse, cached: CachedResponse): void {
    this.setCorsHeaders(res);
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', Math.round((Date.now() - cached.cachedAt) / 1000).toString());
    res.writeHead(cached.statusCode, cached.headers);
    res.end(cached.body);
  }

  /**
   * Send health check response
   */
  private sendHealthCheck(res: http.ServerResponse): void {
    const status = this.getStatus();
    this.setCorsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      proxy: 'HedgeEdge WebRequest Proxy',
      version: '1.0.0',
      ...status,
    }));
  }

  /**
   * Send error response
   */
  private sendError(res: http.ServerResponse, statusCode: number, message: string): void {
    this.setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      valid: false,
      error: true,
      message,
    }));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const webRequestProxy = new WebRequestProxy();
