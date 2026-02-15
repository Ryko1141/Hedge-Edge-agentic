/**
 * Named Pipe Client for cTrader Communication
 * 
 * Windows Named Pipes client for communicating with cTrader cBots.
 * Provides a similar interface to ZmqBridge for consistency.
 * 
 * Architecture:
 * - Data pipe: Receives account snapshots from cBot (cTrader -> Desktop App)
 * - Command pipe: Sends commands to cBot (Desktop App -> cTrader)
 * 
 * Protocol:
 * - Messages are JSON lines (newline-delimited JSON)
 * - Each message is a complete JSON object followed by \n
 */

import net from 'net';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface NamedPipeConfig {
  /** Data pipe name (e.g., '\\\\.\\pipe\\HedgeEdgeCTrader') */
  dataPipeName: string;
  /** Command pipe name (e.g., '\\\\.\\pipe\\HedgeEdgeCTrader_Commands') */
  commandPipeName: string;
  /** Reconnection interval in milliseconds */
  reconnectIntervalMs: number;
  /** Command timeout in milliseconds */
  commandTimeoutMs: number;
  /** Maximum buffer size for incoming data */
  maxBufferSize: number;
}

export interface NamedPipeConnectionStatus {
  dataPipe: 'disconnected' | 'connecting' | 'connected' | 'error';
  commandPipe: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastDataReceived?: Date;
  messagesReceived: number;
  commandsSent: number;
  lastError?: string;
}

export interface CTraderSnapshot {
  type: 'ACCOUNT_UPDATE' | 'SNAPSHOT' | 'LICENSE_STATUS' | 'GOODBYE';
  timestamp: string;
  platform: 'CTRADER';
  accountId: string;
  broker: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number | null;
  floatingPnL: number;
  currency: string;
  leverage: number;
  status: string;
  isLicenseValid: boolean;
  isPaused: boolean;
  lastError: string | null;
  positions: CTraderPosition[];
}

export interface CTraderPosition {
  id: string;
  symbol: string;
  volume: number;
  volumeLots: number;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  profit: number;
  swap: number;
  commission: number;
  openTime: string;
  comment: string;
}

export interface CTraderCommand {
  action: 'PAUSE' | 'RESUME' | 'CLOSE_ALL' | 'CLOSE_POSITION' | 'STATUS' | 'PING' | 'CONFIG' | 'SET_CONFIG';
  positionId?: string;
  params?: Record<string, unknown>;
  timestamp?: string;
}

export interface CTraderResponse {
  success: boolean;
  action: string;
  message?: string;
  error?: string;
  data?: unknown;
  timestamp: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_NAMED_PIPE_CONFIG: NamedPipeConfig = {
  dataPipeName: '\\\\.\\pipe\\HedgeEdgeCTrader',
  commandPipeName: '\\\\.\\pipe\\HedgeEdgeCTrader_Commands',
  reconnectIntervalMs: 5000,
  commandTimeoutMs: 5000,
  maxBufferSize: 1024 * 1024, // 1MB
};

// ============================================================================
// Named Pipe Client Class
// ============================================================================

/**
 * Named Pipe Client for cTrader cBot Communication
 * 
 * Events:
 * - 'snapshot': Emitted when a new account snapshot is received
 * - 'status': Emitted when connection status changes
 * - 'error': Emitted on errors
 * - 'goodbye': Emitted when cBot sends goodbye message (shutting down)
 * - 'connected': Emitted when data pipe connects
 * - 'disconnected': Emitted when data pipe disconnects
 */
export class NamedPipeClient extends EventEmitter {
  private config: NamedPipeConfig;
  private status: NamedPipeConnectionStatus;
  
  // Socket connections
  private dataSocket: net.Socket | null = null;
  private commandSocket: net.Socket | null = null;
  
  // State
  private isRunning = false;
  private dataBuffer = '';
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // Command queue for handling request/response
  private pendingCommands: Map<string, {
    resolve: (value: CTraderResponse) => void;
    reject: (reason: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private commandIdCounter = 0;

  constructor(config: Partial<NamedPipeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_NAMED_PIPE_CONFIG, ...config };
    this.status = {
      dataPipe: 'disconnected',
      commandPipe: 'disconnected',
      messagesReceived: 0,
      commandsSent: 0,
    };
  }

  /**
   * Get the current connection status
   */
  getStatus(): NamedPipeConnectionStatus {
    return { ...this.status };
  }

  /**
   * Check if the data pipe is connected
   */
  isConnected(): boolean {
    return this.status.dataPipe === 'connected';
  }

  /**
   * Check if the command pipe is connected
   */
  isCommandConnected(): boolean {
    return this.status.commandPipe === 'connected';
  }

  /**
   * Start the named pipe client
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      console.log('[NamedPipeClient] Already running');
      return true;
    }

    console.log('[NamedPipeClient] Starting Named Pipe client...');
    console.log(`[NamedPipeClient] Data pipe: ${this.config.dataPipeName}`);
    console.log(`[NamedPipeClient] Command pipe: ${this.config.commandPipeName}`);

    this.isRunning = true;
    
    // Start connection attempts
    await this.connectDataPipe();
    
    return true;
  }

  /**
   * Stop the named pipe client
   */
  async stop(): Promise<void> {
    console.log('[NamedPipeClient] Stopping...');
    
    this.isRunning = false;
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Clear pending commands
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client stopped'));
    }
    this.pendingCommands.clear();
    
    // Close sockets
    await this.disconnectDataPipe();
    await this.disconnectCommandPipe();
    
    console.log('[NamedPipeClient] Stopped');
  }

  /**
   * Connect to the data pipe
   */
  private connectDataPipe(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dataSocket) {
        this.dataSocket.destroy();
        this.dataSocket = null;
      }

      this.status.dataPipe = 'connecting';
      this.emitStatus();
      
      console.log(`[NamedPipeClient] Connecting to data pipe: ${this.config.dataPipeName}`);

      const socket = net.createConnection(this.config.dataPipeName, () => {
        console.log('[NamedPipeClient] Data pipe connected');
        this.status.dataPipe = 'connected';
        this.emitStatus();
        this.emit('connected');
        
        // Also connect command pipe when data pipe connects
        this.connectCommandPipe().catch(err => {
          console.warn('[NamedPipeClient] Command pipe connection failed:', err.message);
        });
        
        resolve();
      });

      socket.on('data', (chunk: Buffer) => {
        this.handleDataChunk(chunk);
      });

      socket.on('error', (error: Error) => {
        const nodeError = error as NodeJS.ErrnoException;
        console.error('[NamedPipeClient] Data pipe error:', error.message);
        
        const wasConnecting = this.status.dataPipe === 'connecting';
        this.status.dataPipe = 'error';
        this.status.lastError = error.message;
        this.emitStatus();
        
        // ENOENT means pipe doesn't exist (cBot not running)
        if (nodeError.code === 'ENOENT') {
          console.log('[NamedPipeClient] Pipe not found - cBot may not be running');
        }
        
        this.emit('error', error);
        
        // Reject if we were in the initial connection attempt
        if (wasConnecting) {
          reject(error);
        }
      });

      socket.on('close', () => {
        console.log('[NamedPipeClient] Data pipe closed');
        this.status.dataPipe = 'disconnected';
        this.emitStatus();
        this.emit('disconnected');
        
        this.dataSocket = null;
        this.dataBuffer = '';
        
        // Schedule reconnection if still running
        this.scheduleReconnect();
      });

      socket.on('end', () => {
        console.log('[NamedPipeClient] Data pipe ended');
      });

      this.dataSocket = socket;
      
      // Set a connection timeout
      setTimeout(() => {
        if (this.status.dataPipe === 'connecting') {
          socket.destroy();
          const error = new Error('Connection timeout');
          this.status.dataPipe = 'error';
          this.status.lastError = error.message;
          this.emitStatus();
          reject(error);
        }
      }, 5000);
    });
  }

  /**
   * Disconnect from the data pipe
   */
  private disconnectDataPipe(): Promise<void> {
    return new Promise((resolve) => {
      if (this.dataSocket) {
        this.dataSocket.removeAllListeners();
        this.dataSocket.destroy();
        this.dataSocket = null;
      }
      this.status.dataPipe = 'disconnected';
      this.dataBuffer = '';
      resolve();
    });
  }

  /**
   * Connect to the command pipe
   */
  private connectCommandPipe(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.commandSocket) {
        this.commandSocket.destroy();
        this.commandSocket = null;
      }

      this.status.commandPipe = 'connecting';
      this.emitStatus();
      
      console.log(`[NamedPipeClient] Connecting to command pipe: ${this.config.commandPipeName}`);

      const socket = net.createConnection(this.config.commandPipeName, () => {
        console.log('[NamedPipeClient] Command pipe connected');
        this.status.commandPipe = 'connected';
        this.emitStatus();
        resolve();
      });

      socket.on('data', (chunk: Buffer) => {
        this.handleCommandResponse(chunk);
      });

      socket.on('error', (error: Error) => {
        console.error('[NamedPipeClient] Command pipe error:', error.message);
        const wasConnecting = this.status.commandPipe === 'connecting';
        this.status.commandPipe = 'error';
        this.status.lastError = error.message;
        this.emitStatus();
        
        if (wasConnecting) {
          reject(error);
        }
      });

      socket.on('close', () => {
        console.log('[NamedPipeClient] Command pipe closed');
        this.status.commandPipe = 'disconnected';
        this.emitStatus();
        this.commandSocket = null;
        
        // Reject all pending commands
        for (const [id, pending] of this.pendingCommands) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Command pipe closed'));
        }
        this.pendingCommands.clear();
      });

      this.commandSocket = socket;
      
      // Set a connection timeout
      setTimeout(() => {
        if (this.status.commandPipe === 'connecting') {
          socket.destroy();
          const error = new Error('Command pipe connection timeout');
          this.status.commandPipe = 'error';
          this.status.lastError = error.message;
          this.emitStatus();
          reject(error);
        }
      }, 5000);
    });
  }

  /**
   * Disconnect from the command pipe
   */
  private disconnectCommandPipe(): Promise<void> {
    return new Promise((resolve) => {
      if (this.commandSocket) {
        this.commandSocket.removeAllListeners();
        this.commandSocket.destroy();
        this.commandSocket = null;
      }
      this.status.commandPipe = 'disconnected';
      resolve();
    });
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (!this.isRunning) return;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    console.log(`[NamedPipeClient] Scheduling reconnect in ${this.config.reconnectIntervalMs}ms`);
    
    this.reconnectTimer = setTimeout(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.connectDataPipe();
      } catch (error) {
        console.log('[NamedPipeClient] Reconnection failed, will retry...');
        this.scheduleReconnect();
      }
    }, this.config.reconnectIntervalMs);
  }

  /**
   * Handle incoming data chunk from the data pipe
   * Buffers partial JSON lines and parses complete messages
   */
  private handleDataChunk(chunk: Buffer): void {
    this.dataBuffer += chunk.toString('utf-8');
    
    // Check buffer size to prevent memory issues
    if (this.dataBuffer.length > this.config.maxBufferSize) {
      console.warn('[NamedPipeClient] Buffer overflow, clearing buffer');
      this.dataBuffer = '';
      return;
    }
    
    // Process complete JSON lines
    let newlineIndex: number;
    while ((newlineIndex = this.dataBuffer.indexOf('\n')) !== -1) {
      const line = this.dataBuffer.substring(0, newlineIndex).trim();
      this.dataBuffer = this.dataBuffer.substring(newlineIndex + 1);
      
      if (line.length > 0) {
        this.processJsonLine(line);
      }
    }
  }

  /**
   * Process a complete JSON line from the data pipe
   */
  private processJsonLine(line: string): void {
    try {
      const message = JSON.parse(line);
      
      this.status.messagesReceived++;
      this.status.lastDataReceived = new Date();
      
      // Handle different message types
      if (message.type === 'GOODBYE') {
        console.log('[NamedPipeClient] Received goodbye from cBot');
        this.emit('goodbye', message);
      } else if (message.type === 'LICENSE_STATUS') {
        this.emit('licenseStatus', message);
      } else {
        // Convert to standard snapshot format if needed
        const snapshot = this.normalizeSnapshot(message);
        this.emit('snapshot', snapshot);
      }
    } catch (error) {
      console.error('[NamedPipeClient] Failed to parse JSON:', error);
      this.emit('error', new Error(`Invalid JSON: ${line.substring(0, 100)}`));
    }
  }

  /**
   * Normalize cTrader snapshot to standard format
   */
  private normalizeSnapshot(message: Record<string, unknown>): CTraderSnapshot {
    // Map cTrader message format to our standard format
    return {
      type: (message.type as string) === 'ACCOUNT_UPDATE' ? 'SNAPSHOT' : (message.type as CTraderSnapshot['type']) || 'SNAPSHOT',
      timestamp: (message.timestamp as string) || new Date().toISOString(),
      platform: 'CTRADER',
      accountId: String(message.accountId || ''),
      broker: (message.broker as string) || '',
      balance: Number(message.balance) || 0,
      equity: Number(message.equity) || 0,
      margin: Number(message.margin) || 0,
      freeMargin: Number(message.freeMargin) || 0,
      marginLevel: message.marginLevel !== undefined ? Number(message.marginLevel) : null,
      floatingPnL: Number(message.floatingPnL) || 0,
      currency: (message.currency as string) || 'USD',
      leverage: Number(message.leverage) || 1,
      status: (message.status as string) || 'UNKNOWN',
      isLicenseValid: Boolean(message.isLicenseValid),
      isPaused: Boolean(message.isPaused),
      lastError: (message.lastError as string | null) || null,
      positions: this.normalizePositions(message.positions as unknown[]),
    };
  }

  /**
   * Normalize positions array
   */
  private normalizePositions(positions: unknown[]): CTraderPosition[] {
    if (!Array.isArray(positions)) return [];
    
    return positions.map((p: unknown) => {
      const pos = p as Record<string, unknown>;
      return {
        id: String(pos.id || ''),
        symbol: String(pos.symbol || ''),
        volume: Number(pos.volume) || 0,
        volumeLots: Number(pos.volumeLots) || 0,
        side: (pos.side as 'BUY' | 'SELL') || 'BUY',
        entryPrice: Number(pos.entryPrice) || 0,
        currentPrice: Number(pos.currentPrice) || 0,
        stopLoss: pos.stopLoss !== undefined ? Number(pos.stopLoss) : null,
        takeProfit: pos.takeProfit !== undefined ? Number(pos.takeProfit) : null,
        profit: Number(pos.profit) || 0,
        swap: Number(pos.swap) || 0,
        commission: Number(pos.commission) || 0,
        openTime: String(pos.openTime || ''),
        comment: String(pos.comment || ''),
      };
    });
  }

  /**
   * Handle command response from the command pipe
   */
  private handleCommandResponse(chunk: Buffer): void {
    try {
      const responseStr = chunk.toString('utf-8').trim();
      const response = JSON.parse(responseStr) as CTraderResponse;
      
      // Find the pending command (we use FIFO for simplicity since we send one at a time)
      const [pendingId] = this.pendingCommands.keys();
      const pending = pendingId ? this.pendingCommands.get(pendingId) : undefined;
      
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(pendingId);
        pending.resolve(response);
      }
    } catch (error) {
      console.error('[NamedPipeClient] Failed to parse command response:', error);
    }
  }

  /**
   * Send a command to the cBot
   */
  async sendCommand(command: CTraderCommand): Promise<CTraderResponse> {
    if (!this.isConnected()) {
      throw new Error('Data pipe not connected');
    }

    // Ensure command pipe is connected
    if (!this.isCommandConnected()) {
      try {
        await this.connectCommandPipe();
      } catch (error) {
        throw new Error(`Failed to connect to command pipe: ${(error as Error).message}`);
      }
    }

    return new Promise((resolve, reject) => {
      const commandId = `cmd_${++this.commandIdCounter}`;
      
      // Add timestamp to command
      const commandWithTimestamp: CTraderCommand = {
        ...command,
        timestamp: new Date().toISOString(),
      };
      
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error('Command timeout'));
      }, this.config.commandTimeoutMs);
      
      // Store pending command
      this.pendingCommands.set(commandId, { resolve, reject, timeout });
      
      // Send the command
      const commandJson = JSON.stringify(commandWithTimestamp) + '\n';
      
      this.commandSocket?.write(commandJson, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingCommands.delete(commandId);
          reject(error);
        } else {
          this.status.commandsSent++;
        }
      });
    });
  }

  /**
   * Send a ping command to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.sendCommand({ action: 'PING' });
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * Request current status/snapshot
   */
  async requestStatus(): Promise<CTraderResponse> {
    return this.sendCommand({ action: 'STATUS' });
  }

  /**
   * Emit status update event
   */
  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Named Pipe client with default configuration
 */
export function createNamedPipeClient(config?: Partial<NamedPipeConfig>): NamedPipeClient {
  return new NamedPipeClient(config);
}

/**
 * Create a Named Pipe client for a specific cTrader instance
 * @param instanceId - Unique identifier for the cTrader instance (used as pipe suffix)
 */
export function createNamedPipeClientForInstance(instanceId?: string): NamedPipeClient {
  const suffix = instanceId ? `_${instanceId}` : '';
  return new NamedPipeClient({
    dataPipeName: `\\\\.\\pipe\\HedgeEdgeCTrader${suffix}`,
    commandPipeName: `\\\\.\\pipe\\HedgeEdgeCTrader_Commands${suffix}`,
  });
}

/**
 * Check if a named pipe exists (cBot is running)
 */
export function checkPipeExists(pipeName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(pipeName, () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    // Timeout after 1 second
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);
  });
}

/**
 * Check if the default cTrader pipe exists
 */
export async function isCTraderPipeAvailable(): Promise<boolean> {
  return checkPipeExists(DEFAULT_NAMED_PIPE_CONFIG.dataPipeName);
}

// ============================================================================
// Exports
// ============================================================================

export default NamedPipeClient;
