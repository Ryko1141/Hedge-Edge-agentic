/**
 * Port Manager — Centralized Port Governance
 * ============================================
 * 
 * Single source of truth for ALL port allocation, validation, and lifecycle
 * management in the Hedge-Edge desktop application.
 * 
 * Problems this solves:
 * ─────────────────────
 * 1. STALE REGISTRATION FILES: After MT5 crashes, orphaned JSON registration
 *    files point at ports that may be reused by other processes. We now verify
 *    liveness via TCP probe + ZMQ PING before trusting any registration file.
 * 
 * 2. RACE CONDITIONS: Concurrent `scanAndConnectAllMT5Terminals()` calls could
 *    create duplicate ZMQ bridges for the same port. A scan mutex ensures only
 *    one scan runs at a time.
 * 
 * 3. NO EADDRINUSE RETRY: The WebRequest proxy would silently fail if port 9089
 *    was occupied. Now we retry with incrementing ports up to a configurable max.
 * 
 * 4. FALSE-POSITIVE ZMQ CONNECTIONS: ZMQ `connect()` never fails — we now do a
 *    fast TCP probe first (50ms) to confirm something is listening before creating
 *    an expensive ZMQ bridge.
 * 
 * 5. PORT CONFLICT DETECTION: No validation that agent ports (5101/5102) don't
 *    collide with ZMQ ports (51810+) or proxy port (9089). Now checked at startup.
 * 
 * 6. RESOURCE LEAKS: Bridge cleanup errors could leave zombies. Allocation table
 *    tracks every active port and force-cleans on shutdown.
 * 
 * Architecture:
 * ─────────────
 *  ┌──────────────────────────────────────────────────────────┐
 *  │                    PortManager (singleton)                │
 *  │                                                          │
 *  │  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐  │
 *  │  │ Port Registry    │  │ Scan Mutex   │  │ Validators │  │
 *  │  │ (allocated ports)│  │ (one-at-time)│  │ (conflict, │  │
 *  │  │                  │  │              │  │  range,     │  │
 *  │  │                  │  │              │  │  liveness)  │  │
 *  │  └─────────────────┘  └──────────────┘  └────────────┘  │
 *  └──────────────────────────────────────────────────────────┘
 *           │                     │                  │
 *  ┌────────▼──────┐    ┌────────▼────────┐   ┌─────▼──────┐
 *  │ agent-channel  │    │ webrequest-proxy│   │ agent-config│
 *  │ -reader.ts     │    │ .ts             │   │ .ts         │
 *  └───────────────┘    └─────────────────┘   └────────────┘
 */

import net from 'net';
import { promises as fs } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export type PortOwner =
  | 'zmq-data'           // ZMQ PUB/SUB data socket
  | 'zmq-command'        // ZMQ REQ/REP command socket
  | 'webrequest-proxy'   // WebRequest HTTP proxy
  | 'agent-mt5'          // MT5 agent HTTP endpoint
  | 'agent-ctrader';     // cTrader agent HTTP endpoint

export interface PortAllocation {
  port: number;
  owner: PortOwner;
  /** Human-readable label (e.g., "mt5-12345" terminal ID) */
  label: string;
  /** When this allocation was made */
  allocatedAt: Date;
  /** Whether we've verified something is actually listening */
  verified: boolean;
}

export interface PortConflict {
  port: number;
  existingOwner: PortOwner;
  existingLabel: string;
  requestedOwner: PortOwner;
  requestedLabel: string;
}

export interface RegistrationValidation {
  login: string;
  dataPort: number;
  commandPort: number;
  isAlive: boolean;
  isStale: boolean;
  fileAge: number;  // milliseconds
  reason?: string;
}

export interface ScanResult {
  terminalId: string;
  dataPort: number;
  commandPort: number;
  source: 'registration' | 'fallback';
  alive: boolean;
  reason?: string;
  /** v3+: EA role (master or slave) from registration file */
  role?: 'master' | 'slave';
  /** v3+: CURVE encryption enabled */
  curveEnabled?: boolean;
  /** v3+: Server public key for CURVE */
  curveServerKey?: string;
  /** v4+: Explicit control port for liveness gate (ZMQ PAIR) */
  controlPort?: number;
}

export interface PortManagerConfig {
  /** TCP probe timeout in ms (default: 150) */
  tcpProbeTimeoutMs: number;
  /** Maximum age for a registration file before it's considered stale (default: 5 min) */
  maxRegistrationAgeMs: number;
  /** Port range for WebRequest proxy fallback (default: 9089-9099) */
  proxyPortRange: { start: number; end: number };
  /** ZMQ port range boundaries for validation */
  zmqPortRange: { start: number; end: number; step: number };
  /** Scan mutex timeout — abort waiting after this (default: 30s) */
  scanMutexTimeoutMs: number;
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_PORT_CONFIG: PortManagerConfig = {
  tcpProbeTimeoutMs: 50,   // 50ms is safe for localhost (127.0.0.1) probes
  maxRegistrationAgeMs: 5 * 60 * 1000,  // 5 minutes
  proxyPortRange: { start: 9089, end: 9099 },
  zmqPortRange: { start: 51810, end: 51840, step: 10 },
  scanMutexTimeoutMs: 30_000,
};

/**
 * All known port ranges in the application.
 * Used for conflict detection — no port should be assigned from
 * one subsystem's range into another's.
 */
export const PORT_RANGES = {
  zmqData:   { start: 51810, end: 51840, label: 'ZMQ Data (PUB/SUB)' },
  zmqCmd:    { start: 51811, end: 51841, label: 'ZMQ Command (REQ/REP)' },
  proxy:     { start: 9089,  end: 9099,  label: 'WebRequest Proxy' },
  agentMt5:  { start: 5101,  end: 5101,  label: 'MT5 Agent HTTP' },
  agentCt:   { start: 5102,  end: 5102,  label: 'cTrader Agent HTTP' },
} as const;

// ============================================================================
// Port Manager Class
// ============================================================================

export class PortManager extends EventEmitter {
  private config: PortManagerConfig;

  /** Active port allocations — the canonical registry */
  private allocations: Map<number, PortAllocation> = new Map();

  /** Scan mutex: prevents concurrent scanAndConnect calls */
  private scanLock: Promise<void> | null = null;
  private scanLockRelease: (() => void) | null = null;

  constructor(config: Partial<PortManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PORT_CONFIG, ...config };
  }

  // ==========================================================================
  // Port Validation
  // ==========================================================================

  /**
   * Validate that a port number is in the legal TCP range
   */
  isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  /**
   * Validate that a ZMQ data port is in the expected range and is aligned
   * to the step boundary (e.g., 51810, 51820, 51830…)
   */
  isValidZmqDataPort(port: number): boolean {
    if (!this.isValidPort(port)) return false;
    const { start, end, step } = this.config.zmqPortRange;
    return port >= start && port <= end && (port - start) % step === 0;
  }

  /**
   * Validate that a ZMQ command port is the expected data+1 companion
   */
  isValidZmqPortPair(dataPort: number, commandPort: number): boolean {
    return this.isValidZmqDataPort(dataPort) && commandPort === dataPort + 1;
  }

  /**
   * Check if a port is within any reserved range of another subsystem
   */
  getPortRangeConflict(port: number, requestedOwner: PortOwner): string | null {
    // A zmq-data port shouldn't be in the proxy range, etc.
    for (const [rangeKey, range] of Object.entries(PORT_RANGES)) {
      if (port >= range.start && port <= range.end) {
        // Check if this range is compatible with the requested owner
        const compatible = this.isOwnerCompatibleWithRange(requestedOwner, rangeKey);
        if (!compatible) {
          return `Port ${port} falls within ${range.label} range (${range.start}-${range.end})`;
        }
      }
    }
    return null;
  }

  private isOwnerCompatibleWithRange(owner: PortOwner, rangeKey: string): boolean {
    const compatibility: Record<PortOwner, string[]> = {
      'zmq-data':         ['zmqData'],
      'zmq-command':      ['zmqCmd'],
      'webrequest-proxy': ['proxy'],
      'agent-mt5':        ['agentMt5'],
      'agent-ctrader':    ['agentCt'],
    };
    return compatibility[owner]?.includes(rangeKey) ?? false;
  }

  // ==========================================================================
  // Port Probing (TCP-level liveness)
  // ==========================================================================

  /**
   * Fast TCP probe to check if anything is listening on a port.
   * Returns true if a TCP connection can be established within the timeout.
   * 
   * This is MUCH faster and more reliable than ZMQ connect(), which always
   * succeeds even with nothing listening. Use this to pre-filter ports
   * before creating expensive ZMQ bridges.
   */
  tcpProbe(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const done = (alive: boolean) => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        resolve(alive);
      };

      socket.setTimeout(this.config.tcpProbeTimeoutMs);
      socket.on('connect', () => done(true));
      socket.on('timeout', () => done(false));
      socket.on('error',   () => done(false));

      socket.connect(port, host);
    });
  }

  /**
   * Check if a port is available (nothing is listening).
   * Creates a temporary server to test binding.
   */
  isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, host);
    });
  }

  /**
   * Find the first available port in a range (for proxy fallback).
   * Tries each port sequentially until one is bindable.
   */
  async findAvailablePort(startPort: number, endPort: number, host = '127.0.0.1'): Promise<number | null> {
    for (let port = startPort; port <= endPort; port++) {
      // Skip already-allocated ports
      if (this.allocations.has(port)) continue;
      
      const available = await this.isPortAvailable(port, host);
      if (available) return port;
    }
    return null;
  }

  // ==========================================================================
  // Port Allocation Registry
  // ==========================================================================

  /**
   * Register a port as actively in use.
   * Returns a PortConflict if the port is already allocated.
   */
  allocate(port: number, owner: PortOwner, label: string): PortConflict | null {
    const existing = this.allocations.get(port);
    if (existing) {
      const conflict: PortConflict = {
        port,
        existingOwner: existing.owner,
        existingLabel: existing.label,
        requestedOwner: owner,
        requestedLabel: label,
      };
      console.warn(`[PortManager] Conflict: port ${port} already allocated to ${existing.owner}/${existing.label}, requested by ${owner}/${label}`);
      this.emit('conflict', conflict);
      return conflict;
    }

    this.allocations.set(port, {
      port,
      owner,
      label,
      allocatedAt: new Date(),
      verified: false,
    });

    console.log(`[PortManager] Allocated port ${port} → ${owner}/${label}`);
    this.emit('allocated', { port, owner, label });
    return null;
  }

  /**
   * Mark an allocated port as verified (something is confirmed listening)
   */
  markVerified(port: number): void {
    const alloc = this.allocations.get(port);
    if (alloc) {
      alloc.verified = true;
    }
  }

  /**
   * Release a port allocation (bridge disconnected, proxy stopped, etc.)
   */
  release(port: number): void {
    const alloc = this.allocations.get(port);
    if (alloc) {
      console.log(`[PortManager] Released port ${port} (was ${alloc.owner}/${alloc.label})`);
      this.allocations.delete(port);
      this.emit('released', { port, owner: alloc.owner, label: alloc.label });
    }
  }

  /**
   * Release all ports for a given label (e.g., terminal ID)
   */
  releaseByLabel(label: string): void {
    for (const [port, alloc] of this.allocations) {
      if (alloc.label === label) {
        this.release(port);
      }
    }
  }

  /**
   * Get all current allocations
   */
  getAllocations(): PortAllocation[] {
    return Array.from(this.allocations.values());
  }

  /**
   * Get allocation for a specific port
   */
  getAllocation(port: number): PortAllocation | null {
    return this.allocations.get(port) || null;
  }

  /**
   * Check if a port is allocated
   */
  isAllocated(port: number): boolean {
    return this.allocations.has(port);
  }

  // ==========================================================================
  // Registration File Validation
  // ==========================================================================

  /**
   * Validate EA registration files for staleness and liveness.
   * 
   * Strategy:
   * 1. Check file modification time — if older than maxRegistrationAgeMs, mark stale
   * 2. TCP-probe the data port — if nothing is listening, the EA is dead
   * 3. Files that are both stale AND dead are candidates for cleanup
   * 
   * Returns validated registrations with liveness status.
   */
  async validateRegistrations(
    registrations: Array<{
      login: string;
      dataPort: number;
      commandPort: number;
      startTime?: string;
      filePath?: string;
    }>
  ): Promise<RegistrationValidation[]> {
    const results: RegistrationValidation[] = [];

    // Probe all data ports in parallel for speed
    const probePromises = registrations.map(async (reg) => {
      let fileAge = 0;
      let isStale = false;

      // Check file age if path is available
      if (reg.filePath) {
        try {
          const stat = await fs.stat(reg.filePath);
          fileAge = Date.now() - stat.mtimeMs;
          isStale = fileAge > this.config.maxRegistrationAgeMs;
        } catch {
          // File doesn't exist or can't be read
          fileAge = Infinity;
          isStale = true;
        }
      }

      // Check startTime as secondary staleness indicator
      if (reg.startTime && !isStale) {
        try {
          const startDate = new Date(reg.startTime);
          const age = Date.now() - startDate.getTime();
          // If startTime is more than 24 hours old and file hasn't been updated
          // recently, it's suspicious (EAs typically restart daily)
          if (age > 24 * 60 * 60 * 1000 && fileAge > this.config.maxRegistrationAgeMs) {
            isStale = true;
          }
        } catch {
          // Invalid date — ignore
        }
      }

      // TCP probe to verify something is listening
      const isAlive = await this.tcpProbe(reg.dataPort);

      let reason: string | undefined;
      if (isStale && !isAlive) {
        reason = `Stale registration (file age: ${Math.round(fileAge / 1000)}s) and port ${reg.dataPort} not responding`;
      } else if (isStale && isAlive) {
        reason = `File appears stale but port ${reg.dataPort} is active — EA may have restarted`;
      } else if (!isStale && !isAlive) {
        reason = `Fresh registration but port ${reg.dataPort} not responding — EA may be starting up`;
      }

      return {
        login: reg.login,
        dataPort: reg.dataPort,
        commandPort: reg.commandPort,
        isAlive,
        isStale,
        fileAge,
        reason,
      };
    });

    const validations = await Promise.all(probePromises);
    results.push(...validations);

    return results;
  }

  /**
   * Clean up stale registration files that have dead ports.
   * Only deletes files where the port is confirmed not responding AND the file is stale.
   */
  async cleanStaleRegistrations(regDirPath: string): Promise<string[]> {
    const cleaned: string[] = [];

    try {
      const files = await fs.readdir(regDirPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(regDirPath, file);
        try {
          const buffer = await fs.readFile(filePath);
          let content: string;
          // Handle MQL5 file encoding (UTF-16 LE BOM = FF FE)
          if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
            content = buffer.toString('utf16le').substring(1);
          } else if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
            content = buffer.toString('utf-8').substring(1);
          } else {
            content = buffer.toString('utf-8');
          }
          const cleanContent = content.replace(/\0/g, '').trim();
          const reg = JSON.parse(cleanContent);

          if (!reg.dataPort && !reg.commandPort) continue;

          // Determine which port to probe: dataPort for masters, commandPort for slaves
          const probePort = reg.dataPort || reg.commandPort;

          const stat = await fs.stat(filePath);
          const fileAge = Date.now() - stat.mtimeMs;

          // Only clean if BOTH stale AND port is dead
          if (fileAge > this.config.maxRegistrationAgeMs) {
            const alive = await this.tcpProbe(probePort);
            if (!alive) {
              console.log(`[PortManager] Cleaning stale registration: ${file} (age: ${Math.round(fileAge / 1000)}s, port ${probePort} dead)`);
              await fs.unlink(filePath);
              cleaned.push(file);
            }
          }
        } catch (err) {
          console.warn(`[PortManager] Error processing registration file ${file}:`, err instanceof Error ? err.message : err);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read — that's fine
    }

    return cleaned;
  }

  // ==========================================================================
  // Scan Mutex
  // ==========================================================================

  /**
   * Acquire the scan lock. If another scan is in progress, waits for it
   * to complete (up to scanMutexTimeoutMs) rather than running concurrently.
   * 
   * Returns a release function that MUST be called when the scan is done.
   * Returns null if the lock couldn't be acquired (timeout).
   */
  async acquireScanLock(): Promise<(() => void) | null> {
    // If a scan is already running, wait for it
    if (this.scanLock) {
      console.log('[PortManager] Scan already in progress, waiting...');
      try {
        await Promise.race([
          this.scanLock,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Scan mutex timeout')), this.config.scanMutexTimeoutMs)
          ),
        ]);
      } catch (err) {
        console.warn('[PortManager] Scan mutex wait failed:', err instanceof Error ? err.message : err);
        return null;
      }
    }

    // Create new lock
    let releaseFn: () => void;
    this.scanLock = new Promise<void>((resolve) => {
      releaseFn = () => {
        this.scanLock = null;
        this.scanLockRelease = null;
        resolve();
      };
    });
    this.scanLockRelease = releaseFn!;

    return releaseFn!;
  }

  // ==========================================================================
  // Smart Port Discovery
  // ==========================================================================

  /**
   * Discover live ZMQ endpoints using fast TCP probing.
   * 
   * This replaces the old strategy of creating ZMQ bridges for all fallback
   * ports and waiting 7 seconds. Instead:
   * 
   * 1. TCP-probe all candidate ports in parallel (~150ms total)
   * 2. Only create ZMQ bridges for ports that respond
   * 3. Saves ~7s startup time and avoids zombie bridges
   * 
   * @param candidates - Array of port pairs to check
   * @returns Array of ScanResults indicating which are alive
   */
  async discoverLivePorts(
    candidates: Array<{ dataPort: number; commandPort: number; controlPort?: number; name: string; source: 'registration' | 'fallback'; role?: 'master' | 'slave'; curveEnabled?: boolean; curveServerKey?: string }>
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    // Probe all data ports in parallel
    const probeResults = await Promise.all(
      candidates.map(async (c) => {
        const alive = await this.tcpProbe(c.dataPort);
        return {
          ...c,
          alive,
          reason: alive ? undefined : `Port ${c.dataPort} not responding to TCP probe`,
        };
      })
    );

    for (const probe of probeResults) {
      results.push({
        terminalId: probe.name,
        dataPort: probe.dataPort,
        commandPort: probe.commandPort,
        controlPort: probe.controlPort,
        source: probe.source,
        alive: probe.alive,
        reason: probe.reason,
        role: probe.role,
        curveEnabled: probe.curveEnabled,
        curveServerKey: probe.curveServerKey,
      });
    }

    const aliveCount = results.filter(r => r.alive).length;
    console.log(`[PortManager] Discovery: ${aliveCount}/${candidates.length} ports alive`);

    return results;
  }

  // ==========================================================================
  // Proxy Port Allocation with Fallback
  // ==========================================================================

  /**
   * Find and allocate a port for the WebRequest proxy.
   * Tries the preferred port first, then falls back through the range.
   * 
   * @returns The allocated port number, or null if no port available
   */
  async allocateProxyPort(preferredPort?: number): Promise<number | null> {
    const { start, end } = this.config.proxyPortRange;
    const firstPort = preferredPort ?? start;

    // Try preferred port first
    if (await this.isPortAvailable(firstPort)) {
      const conflict = this.allocate(firstPort, 'webrequest-proxy', 'http-proxy');
      if (!conflict) return firstPort;
    }

    // Fall back through range
    for (let port = start; port <= end; port++) {
      if (port === firstPort) continue; // Already tried
      if (this.allocations.has(port)) continue;

      if (await this.isPortAvailable(port)) {
        const conflict = this.allocate(port, 'webrequest-proxy', 'http-proxy');
        if (!conflict) return port;
      }
    }

    console.error(`[PortManager] No available port in range ${start}-${end} for WebRequest proxy`);
    return null;
  }

  // ==========================================================================
  // Conflict Detection
  // ==========================================================================

  /**
   * Check for conflicts between all configured port assignments.
   * Call at startup to surface misconfigurations early.
   */
  detectStartupConflicts(config: {
    agentMt5Port: number;
    agentCtraderPort: number;
    proxyPort: number;
  }): PortConflict[] {
    const conflicts: PortConflict[] = [];
    const allPorts = [
      { port: config.agentMt5Port,      owner: 'agent-mt5' as PortOwner,        label: 'mt5-agent' },
      { port: config.agentCtraderPort,   owner: 'agent-ctrader' as PortOwner,    label: 'ctrader-agent' },
      { port: config.proxyPort,          owner: 'webrequest-proxy' as PortOwner, label: 'http-proxy' },
    ];

    // Check for port collisions between subsystems
    for (let i = 0; i < allPorts.length; i++) {
      for (let j = i + 1; j < allPorts.length; j++) {
        if (allPorts[i].port === allPorts[j].port) {
          conflicts.push({
            port: allPorts[i].port,
            existingOwner: allPorts[i].owner,
            existingLabel: allPorts[i].label,
            requestedOwner: allPorts[j].owner,
            requestedLabel: allPorts[j].label,
          });
        }
      }
    }

    // Check for cross-range conflicts (e.g., agent port in ZMQ range)
    for (const p of allPorts) {
      const rangeConflict = this.getPortRangeConflict(p.port, p.owner);
      if (rangeConflict) {
        console.warn(`[PortManager] Range conflict: ${p.owner}/${p.label}: ${rangeConflict}`);
      }
    }

    // Check ZMQ range overlaps
    const { start, end, step } = this.config.zmqPortRange;
    for (let dataPort = start; dataPort <= end; dataPort += step) {
      const cmdPort = dataPort + 1;
      for (const p of allPorts) {
        if (p.port === dataPort || p.port === cmdPort) {
          conflicts.push({
            port: p.port,
            existingOwner: p.owner,
            existingLabel: p.label,
            requestedOwner: 'zmq-data',
            requestedLabel: `zmq-${dataPort}`,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      console.warn(`[PortManager] Detected ${conflicts.length} startup port conflict(s):`);
      for (const c of conflicts) {
        console.warn(`  Port ${c.port}: ${c.existingOwner}/${c.existingLabel} vs ${c.requestedOwner}/${c.requestedLabel}`);
      }
    } else {
      console.log('[PortManager] No startup port conflicts detected');
    }

    return conflicts;
  }

  // ==========================================================================
  // Health & Diagnostics
  // ==========================================================================

  /**
   * Get a diagnostic summary of all port allocations and their status
   */
  async getDiagnostics(): Promise<{
    allocations: PortAllocation[];
    zombies: PortAllocation[];
    totalAllocated: number;
  }> {
    const allocations = this.getAllocations();
    const zombies: PortAllocation[] = [];

    // Check each allocation for liveness
    for (const alloc of allocations) {
      if (alloc.owner === 'webrequest-proxy') {
        // For proxy, check if server is still bound
        const alive = !(await this.isPortAvailable(alloc.port));
        if (!alive) zombies.push(alloc);
      } else if (alloc.owner === 'zmq-data' || alloc.owner === 'zmq-command') {
        // For ZMQ, TCP probe
        const alive = await this.tcpProbe(alloc.port);
        if (!alive && alloc.verified) {
          // Was verified before but now dead — zombie
          zombies.push(alloc);
        }
      }
    }

    return {
      allocations,
      zombies,
      totalAllocated: allocations.length,
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Release all allocations and reset state
   */
  shutdown(): void {
    console.log(`[PortManager] Shutting down, releasing ${this.allocations.size} port allocation(s)`);
    this.allocations.clear();

    // Release scan lock if held
    if (this.scanLockRelease) {
      this.scanLockRelease();
    }
    this.scanLock = null;
    this.scanLockRelease = null;

    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const portManager = new PortManager();
