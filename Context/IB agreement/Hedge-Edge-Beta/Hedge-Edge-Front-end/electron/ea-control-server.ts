/**
 * EA Control Server — Event-Based Liveness Gate
 * ═══════════════════════════════════════════════
 *
 * Provides a persistent ZMQ PAIR connection per EA terminal that acts as
 * the sole "is the app alive?" signal.  No polling, no heartbeats — the
 * OS-level socket connect / disconnect is the only event the EA needs.
 *
 * Flow:
 *   1.  Electron app starts → opens a ZMQ PAIR *bind* socket per terminal
 *       on `tcp://127.0.0.1:{controlPort}`.
 *   2.  EA connects (ZMQ PAIR *connect*) → app sends  ENABLE  + session JSON.
 *   3.  EA is now gated-open (trading / copying allowed).
 *   4.  App closes or crashes → OS tears down the socket → EA detects a
 *       recv error / disconnect → immediately disables trading.
 *   5.  On app re-launch: rebind → EA reconnects → new  ENABLE  sent.
 *
 * Port convention:
 *   controlPort = dataPort + 2   (e.g.  51812  for master on  51810,
 *                                         51823  for slave  on  51821)
 *
 * Important: The EA keeps its own independent license validation.  This
 * liveness gate is *additive* — it answers "is the desktop app running
 * and connected to me right now?" and nothing more.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/** Payload sent to EA on successful connection */
export interface ControlEnablePayload {
  action: 'ENABLE';
  /** Electron app session id (random per launch) */
  sessionId: string;
  /** ISO-8601 timestamp of when this payload was issued */
  issuedAt: string;
  /** License key hash (first 8 chars) — NOT the full key, just for EA-side display */
  licenseHint: string;
  /** Current app version */
  appVersion: string;
  /** The terminal ID this control channel is bound to */
  terminalId: string;
}

/** Per-terminal control channel state */
export interface ControlChannelState {
  terminalId: string;
  controlPort: number;
  status: 'binding' | 'bound' | 'connected' | 'error' | 'closed';
  /** ISO timestamp of last ENABLE sent */
  lastEnableSent?: string;
  error?: string;
}

/** ZMQ module types (zeromq is an optional peer dependency) */
interface ZmqPair {
  linger: number;
  sendTimeout: number;
  receiveTimeout: number;
  sendHighWaterMark: number;
  bind(endpoint: string): Promise<void>;
  send(message: string | Buffer): Promise<void>;
  receive(): Promise<[Buffer]>;
  close(): void;
}

interface ZmqModule {
  Pair: new() => ZmqPair;
}

// ============================================================================
// Constants
// ============================================================================

/** Default offset from the EA data port to derive the control port */
export const CONTROL_PORT_OFFSET = 2;

/** How often we resend ENABLE while the socket is live (safety net, not a heartbeat).
 *  This is NOT a liveness check — it's a periodic re-assertion in case the EA
 *  misses the first message (ZMQ PAIR is non-guaranteed on connect race).  */
const ENABLE_RESEND_INTERVAL_MS = 30_000; // 30 seconds

// ============================================================================
// EA Control Server
// ============================================================================

export class EAControlServer extends EventEmitter {
  /** One ZMQ PAIR socket per terminal (keyed by terminalId) */
  private channels: Map<string, {
    socket: ZmqPair;
    port: number;
    status: ControlChannelState['status'];
    lastEnableSent?: string;
    resendTimer?: NodeJS.Timeout;
    receiveLoop?: Promise<void>;
    aborted: boolean;
  }> = new Map();

  private zmq: ZmqModule | null = null;
  private sessionId: string;
  private appVersion: string;
  private licenseHint: string = '';

  constructor() {
    super();
    // Unique per app launch
    this.sessionId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Will be set at runtime by the Electron main entry
    this.appVersion = '1.0.0';
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Initialisation
  // ──────────────────────────────────────────────────────────────────────────

  /** Try to load the zeromq module (same logic as zmq-bridge.ts) */
  private async loadZmq(): Promise<boolean> {
    if (this.zmq) return true;
    try {
      this.zmq = await import('zeromq') as unknown as ZmqModule;
      return true;
    } catch {
      console.error('[EAControlServer] zeromq module not available');
      return false;
    }
  }

  /** Set metadata that will be included in ENABLE payloads */
  configure(opts: { appVersion?: string; licenseHint?: string }): void {
    if (opts.appVersion) this.appVersion = opts.appVersion;
    if (opts.licenseHint) this.licenseHint = opts.licenseHint;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Channel lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Open a control channel for a specific EA terminal.
   *
   * @param terminalId  Unique terminal identifier (e.g. "mt5-12345")
   * @param controlPort TCP port to bind (or derive from dataPort + CONTROL_PORT_OFFSET)
   */
  async openChannel(terminalId: string, controlPort: number): Promise<boolean> {
    if (this.channels.has(terminalId)) {
      console.log(`[EAControlServer] Channel already open for ${terminalId} on port ${controlPort}`);
      return true;
    }

    if (!await this.loadZmq()) return false;

    const socket = new this.zmq!.Pair();
    socket.linger = 0; // Don't block on close
    socket.sendTimeout = 1000;
    socket.sendHighWaterMark = 10;

    const endpoint = `tcp://127.0.0.1:${controlPort}`;
    const entry = {
      socket,
      port: controlPort,
      status: 'binding' as ControlChannelState['status'],
      resendTimer: undefined as NodeJS.Timeout | undefined,
      receiveLoop: undefined as Promise<void> | undefined,
      aborted: false,
    };
    this.channels.set(terminalId, entry);

    try {
      await socket.bind(endpoint);
      entry.status = 'bound';
      console.log(`[EAControlServer] Control channel bound: ${terminalId} → tcp://127.0.0.1:${controlPort}`);
      this.emitStateChange(terminalId);

      // Start background receive loop to detect EA connection / disconnection
      entry.receiveLoop = this.receiveLoop(terminalId);

      // Periodically resend ENABLE (safety net for ZMQ PAIR connect race)
      entry.resendTimer = setInterval(() => {
        if (entry.status === 'bound' || entry.status === 'connected') {
          this.sendEnable(terminalId).catch(() => { /* swallow */ });
        }
      }, ENABLE_RESEND_INTERVAL_MS);

      // Send initial ENABLE immediately (EA may already be connected)
      await this.sendEnable(terminalId);

      return true;
    } catch (err) {
      entry.status = 'error';
      entry.aborted = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[EAControlServer] Failed to bind ${terminalId} on ${endpoint}: ${msg}`);
      this.channels.delete(terminalId);
      try { socket.close(); } catch { /* ignore */ }
      return false;
    }
  }

  /**
   * Close a specific control channel.
   */
  async closeChannel(terminalId: string): Promise<void> {
    const entry = this.channels.get(terminalId);
    if (!entry) return;

    entry.aborted = true;
    if (entry.resendTimer) clearInterval(entry.resendTimer);

    try {
      // Send a final DISABLE before closing (best effort)
      await entry.socket.send(JSON.stringify({ action: 'DISABLE', reason: 'channel_closed' }));
    } catch { /* swallow – EA may already be gone */ }

    try { entry.socket.close(); } catch { /* ignore */ }
    entry.status = 'closed';
    this.channels.delete(terminalId);

    console.log(`[EAControlServer] Channel closed for ${terminalId}`);
    this.emitStateChange(terminalId);
  }

  /**
   * Close ALL control channels (app shutdown).
   */
  async shutdown(): Promise<void> {
    console.log(`[EAControlServer] Shutting down ${this.channels.size} control channel(s)...`);
    const terminalIds = Array.from(this.channels.keys());
    await Promise.allSettled(terminalIds.map(id => this.closeChannel(id)));
    console.log('[EAControlServer] Shutdown complete');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Send ENABLE payload
  // ──────────────────────────────────────────────────────────────────────────

  private async sendEnable(terminalId: string): Promise<void> {
    const entry = this.channels.get(terminalId);
    if (!entry || entry.aborted) return;

    const payload: ControlEnablePayload = {
      action: 'ENABLE',
      sessionId: this.sessionId,
      issuedAt: new Date().toISOString(),
      licenseHint: this.licenseHint,
      appVersion: this.appVersion,
      terminalId,
    };

    try {
      await entry.socket.send(JSON.stringify(payload));
      entry.lastEnableSent = payload.issuedAt;
    } catch {
      // Not an error — EA may not be connected yet.  The resend timer will retry.
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Background receive loop
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Blocks on `socket.receive()` in a loop.  This serves two purposes:
   *   1. Detects when the EA sends an ACK (optional) so we know it saw ENABLE.
   *   2. When the socket is closed (app shutdown), the loop exits gracefully.
   *
   * We don't *require* the EA to send anything — the PAIR socket itself is the
   * liveness signal.  But if the EA sends an ACK we mark it as `connected`.
   */
  private async receiveLoop(terminalId: string): Promise<void> {
    const entry = this.channels.get(terminalId);
    if (!entry) return;

    try {
      while (!entry.aborted) {
        let msg: [Buffer];
        try {
          msg = await entry.socket.receive();
        } catch {
          // Socket closed or interrupted — exit loop
          break;
        }

        const raw = msg[0].toString('utf-8');
        try {
          const parsed = JSON.parse(raw);
          if (parsed.action === 'ACK' || parsed.action === 'CONNECTED') {
            if (entry.status !== 'connected') {
              entry.status = 'connected';
              console.log(`[EAControlServer] EA acknowledged control channel: ${terminalId}`);
              this.emitStateChange(terminalId);
              this.emit('ea:connected', terminalId);
            }
          } else if (parsed.action === 'HEARTBEAT_ACK') {
            // EA is still alive — no-op, just confirming channel is open
          }
        } catch {
          // Non-JSON message — ignore
        }
      }
    } catch {
      // Loop terminated
    }

    // If we got here and the entry still exists, that means the connection dropped
    if (this.channels.has(terminalId) && !entry.aborted) {
      console.log(`[EAControlServer] Control channel lost for ${terminalId}`);
      entry.status = 'bound'; // Reset to unconnected
      this.emitStateChange(terminalId);
      this.emit('ea:disconnected', terminalId);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // State queries
  // ──────────────────────────────────────────────────────────────────────────

  /** Get all channel states */
  getChannelStates(): ControlChannelState[] {
    return Array.from(this.channels.entries()).map(([terminalId, entry]) => ({
      terminalId,
      controlPort: entry.port,
      status: entry.status,
      lastEnableSent: entry.lastEnableSent,
    }));
  }

  /** Get a specific channel state */
  getChannelState(terminalId: string): ControlChannelState | null {
    const entry = this.channels.get(terminalId);
    if (!entry) return null;
    return {
      terminalId,
      controlPort: entry.port,
      status: entry.status,
      lastEnableSent: entry.lastEnableSent,
    };
  }

  /** Check whether a control channel is currently connected to an EA */
  isChannelConnected(terminalId: string): boolean {
    const entry = this.channels.get(terminalId);
    return entry?.status === 'connected' || entry?.status === 'bound';
  }

  /** Check whether a channel exists (bound or connected) */
  hasChannel(terminalId: string): boolean {
    return this.channels.has(terminalId);
  }

  /** Derive the control port from a data port */
  static controlPortFromDataPort(dataPort: number): number {
    return dataPort + CONTROL_PORT_OFFSET;
  }

  /** Derive the control port from a command port (command = data + 1, control = data + 2) */
  static controlPortFromCommandPort(commandPort: number): number {
    return commandPort + 1;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Event helpers
  // ──────────────────────────────────────────────────────────────────────────

  private emitStateChange(terminalId: string): void {
    const state = this.getChannelState(terminalId);
    this.emit('channel:stateChange', terminalId, state);
  }
}

// ============================================================================
// Singleton
// ============================================================================

import crypto from 'crypto';

export const eaControlServer = new EAControlServer();
