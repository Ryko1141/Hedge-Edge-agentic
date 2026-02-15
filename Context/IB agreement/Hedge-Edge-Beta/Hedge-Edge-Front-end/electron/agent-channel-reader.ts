/**
 * Agent Data Channel Reader
 * 
 * HIGH-PERFORMANCE MESSAGING FOR TRADING TERMINALS
 * 
 * MT5: ZeroMQ (sub-millisecond latency)
 * - SUB socket subscribes to EA's PUB socket for real-time snapshots
 * - REQ socket sends commands to EA's REP socket
 * - Auto-discovery: reads EA registration files from Common\Files\HedgeEdge\*.json
 * - Fallback: scans port ranges 51810-51890 (step 10) for legacy EAs
 * 
 * cTrader: Windows Named Pipes
 * - Data pipe receives account snapshots from cBot
 * - Command pipe sends commands to cBot
 * 
 * Architecture:
 * ┌─────────────────┐     ZeroMQ      ┌─────────────────┐
 * │   MT5 EA (ZMQ)  │ ◄─────PUB/SUB────► │  Desktop App    │
 * │  PUB: 51810     │ ◄─────REQ/REP────► │  (Electron)     │
 * │  REP: 51811     │                  │                 │
 * └─────────────────┘                  └─────────────────┘
 * 
 * ┌─────────────────┐   Named Pipes   ┌─────────────────┐
 * │ cTrader cBot    │ ◄─────────────► │  Desktop App    │
 * │ HedgeEdgeCTrader│                 │  (Electron)     │
 * └─────────────────┘                  └─────────────────┘
 */

import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import net from 'net';
import path from 'path';
import { 
  ZmqBridge, 
  createZmqBridgeForPorts, 
  isZmqAvailable,
  ZmqSnapshot,
  ZmqCommand,
  ZmqResponse,
  ZmqEvent,
  ZmqEventType,
  ZmqAccountData,
  ZmqPositionEventData,
  ZmqHeartbeatData,
  ZmqPosition,
  DEFAULT_ZMQ_CONFIG,
} from './zmq-bridge.js';
import { Position } from './shared-types.js';
import {
  NamedPipeClient,
  createNamedPipeClient,
  createNamedPipeClientForInstance,
  isCTraderPipeAvailable,
  CTraderSnapshot,
  CTraderCommand,
  CTraderResponse,
  DEFAULT_NAMED_PIPE_CONFIG,
} from './named-pipe-client.js';
import { portManager, type ScanResult } from './port-manager.js';

// ============================================================================
// Types
// ============================================================================

// Event types for the new event-driven architecture
export interface AgentEvent {
  type: ZmqEventType;
  timestamp: string;
  platform: 'MT5' | 'cTrader';
  accountId: string;
  eventIndex?: number;
  data?: unknown;
}

export interface AgentSnapshot {
  timestamp: string;
  platform: 'MT5' | 'cTrader';
  accountId: string;
  broker: string;
  server?: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPnL: number;
  currency: string;
  leverage: number;
  status: string;
  isLicenseValid: boolean;
  isPaused: boolean;
  lastError: string | null;
  positions: AgentPosition[];
  /** Broker server time for EOD tracking (string format) */
  serverTime?: string;
  /** Broker server time as Unix timestamp */
  serverTimeUnix?: number;
}

// AgentPosition is now a type alias for the canonical Position (from shared-types.ts).
// This eliminates redundant field-by-field mapping in conversion functions since
// ZmqPosition and AgentPosition are structurally identical.
export type AgentPosition = Position;

export interface AgentCommand {
  action: 'PAUSE' | 'RESUME' | 'CLOSE_ALL' | 'CLOSE_POSITION' | 'STATUS' | 'SET_CONFIG';
  params?: Record<string, string | number | boolean>;
  timestamp?: string;
}

export interface AgentResponse {
  success: boolean;
  action: string;
  message: string;
  data?: unknown;
  timestamp: string;
}

export interface ChannelReaderResult {
  success: boolean;
  data?: AgentSnapshot;
  error?: string;
  lastModified?: Date;
}

// ============================================================================
// Constants
// ============================================================================

const MT5_DATA_FILE = 'HedgeEdgeMT5.json';
const MT5_COMMAND_FILE = 'HedgeEdgeMT5_cmd.json';
const MT5_RESPONSE_FILE = 'HedgeEdgeMT5_resp.json';
const CTRADER_PIPE_NAME = 'HedgeEdgeCTrader';
const CTRADER_COMMAND_PIPE = 'HedgeEdgeCTrader_Commands';

// ============================================================================
// cTrader Terminal Configuration
// ============================================================================

export interface CTraderTerminalConfig {
  terminalId: string;
  instanceId?: string;  // Optional instance suffix for multiple cTrader instances
  dataPipeName?: string;
  commandPipeName?: string;
}

// ============================================================================
// MT5 File Channel Reader
// ============================================================================

/**
 * Get the MT5 data file path for a terminal
 */
export function getMT5DataFilePath(terminalDataPath: string): string {
  return path.join(terminalDataPath, 'MQL5', 'Files', MT5_DATA_FILE);
}

/**
 * Get the MT5 command file path
 */
export function getMT5CommandFilePath(terminalDataPath: string): string {
  return path.join(terminalDataPath, 'MQL5', 'Files', MT5_COMMAND_FILE);
}

/**
 * Get the MT5 response file path
 */
export function getMT5ResponseFilePath(terminalDataPath: string): string {
  return path.join(terminalDataPath, 'MQL5', 'Files', MT5_RESPONSE_FILE);
}

/**
 * Read MT5 agent snapshot from file channel
 */
export async function readMT5Snapshot(terminalDataPath: string): Promise<ChannelReaderResult> {
  const filePath = getMT5DataFilePath(terminalDataPath);
  
  try {
    // Check if file exists
    const stats = await fs.stat(filePath);
    
    // Read the file as buffer first to handle BOM and encoding issues
    // MQL5 may write files with UTF-16 LE BOM or Windows-1252 encoding
    const buffer = await fs.readFile(filePath);
    let content: string;
    
    // Check for UTF-16 LE BOM (0xFF 0xFE) - MQL5 default for FileOpen
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      content = buffer.toString('utf16le').substring(1); // Skip BOM
    }
    // Check for UTF-8 BOM (0xEF 0xBB 0xBF)
    else if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      content = buffer.toString('utf-8').substring(1); // Skip BOM
    }
    // Check for UTF-16 BE BOM (0xFE 0xFF)
    else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      // Convert from UTF-16 BE to string
      const swapped = Buffer.alloc(buffer.length);
      for (let i = 0; i < buffer.length - 1; i += 2) {
        swapped[i] = buffer[i + 1];
        swapped[i + 1] = buffer[i];
      }
      content = swapped.toString('utf16le').substring(1); // Skip BOM
    }
    // Assume UTF-8 without BOM (FILE_ANSI in MQL5)
    else {
      content = buffer.toString('utf-8');
    }
    
    // Trim any leading/trailing whitespace and null characters
    content = content.replace(/^\s*/, '').replace(/\s*$/, '').replace(/\0/g, '');
    
    // Handle corrupted files where EA appends instead of overwrites
    // Find the first complete JSON object by matching braces
    let jsonContent = content;
    if (content.startsWith('{')) {
      let braceCount = 0;
      let endIndex = -1;
      for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
      if (endIndex > 0 && endIndex < content.length) {
        console.log(`[AgentChannelReader] Truncating JSON at position ${endIndex} (file has ${content.length} chars, likely corrupted)`);
        jsonContent = content.substring(0, endIndex);
      }
    }
    
    const data = JSON.parse(jsonContent) as AgentSnapshot;
    
    // Validate basic structure
    if (!data.timestamp || !data.platform) {
      return {
        success: false,
        error: 'Invalid snapshot format',
      };
    }
    
    return {
      success: true,
      data,
      lastModified: stats.mtime,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: 'Agent data file not found. Is the EA running?',
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read MT5 snapshot',
    };
  }
}

/**
 * Send a command to MT5 agent via file channel
 */
export async function sendMT5Command(
  terminalDataPath: string,
  command: AgentCommand
): Promise<{ success: boolean; response?: AgentResponse; error?: string }> {
  const commandPath = getMT5CommandFilePath(terminalDataPath);
  const responsePath = getMT5ResponseFilePath(terminalDataPath);
  
  try {
    // Write command file
    const commandWithTimestamp = {
      ...command,
      timestamp: new Date().toISOString(),
    };
    await fs.writeFile(commandPath, JSON.stringify(commandWithTimestamp, null, 2), 'utf-8');
    
    // Wait for response (poll with timeout)
    const startTime = Date.now();
    const timeout = 5000; // 5 seconds
    
    while (Date.now() - startTime < timeout) {
      try {
        const responseContent = await fs.readFile(responsePath, 'utf-8');
        const response = JSON.parse(responseContent) as AgentResponse;
        
        // Check if response is for our command
        if (response.action === command.action) {
          // Clean up command file
          await fs.unlink(commandPath).catch(() => {});
          return { success: true, response };
        }
      } catch {
        // Response not ready yet
      }
      
      // Wait a bit before polling again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return {
      success: false,
      error: 'Command timeout - no response from EA',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send command',
    };
  }
}

// ============================================================================
// cTrader Named Pipe Reader
// ============================================================================

/**
 * Get the cTrader pipe path
 */
export function getCTraderPipePath(): string {
  return `\\\\.\\pipe\\${CTRADER_PIPE_NAME}`;
}

/**
 * Get the cTrader command pipe path
 */
export function getCTraderCommandPipePath(): string {
  return `\\\\.\\pipe\\${CTRADER_COMMAND_PIPE}`;
}

/**
 * Read cTrader agent snapshot from named pipe
 */
export async function readCTraderSnapshot(): Promise<ChannelReaderResult> {
  const pipePath = getCTraderPipePath();
  
  return new Promise((resolve) => {
    const client = net.createConnection(pipePath, () => {
      // Connected successfully
    });
    
    let data = '';
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({
        success: false,
        error: 'Connection timeout',
      });
    }, 3000);
    
    client.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    client.on('end', () => {
      clearTimeout(timeout);
      
      try {
        const snapshot = JSON.parse(data) as AgentSnapshot;
        resolve({
          success: true,
          data: snapshot,
          lastModified: new Date(),
        });
      } catch (error) {
        resolve({
          success: false,
          error: 'Invalid JSON from pipe',
        });
      }
    });
    
    client.on('error', (error) => {
      clearTimeout(timeout);
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({
          success: false,
          error: 'cBot pipe not found. Is the cBot running?',
        });
      } else {
        resolve({
          success: false,
          error: error.message || 'Pipe connection failed',
        });
      }
    });
    
    // Send a read request (empty message triggers snapshot response)
    client.write(JSON.stringify({ action: 'STATUS' }));
  });
}

/**
 * Send a command to cTrader agent via named pipe
 */
export async function sendCTraderCommand(
  command: AgentCommand
): Promise<{ success: boolean; response?: AgentResponse; error?: string }> {
  const pipePath = getCTraderCommandPipePath();
  
  return new Promise((resolve) => {
    const client = net.createConnection(pipePath, () => {
      // Send command
      client.write(JSON.stringify(command));
    });
    
    let data = '';
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({
        success: false,
        error: 'Command timeout',
      });
    }, 5000);
    
    client.on('data', (chunk) => {
      data += chunk.toString();
    });
    
    client.on('end', () => {
      clearTimeout(timeout);
      
      try {
        const response = JSON.parse(data) as AgentResponse;
        resolve({ success: true, response });
      } catch {
        resolve({
          success: false,
          error: 'Invalid response from cBot',
        });
      }
    });
    
    client.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        error: error.message || 'Command failed',
      });
    });
  });
}

// ============================================================================
// Unified Channel Reader (with ZMQ and Named Pipe Support)
// ============================================================================

export type ChannelMode = 'zmq' | 'file' | 'pipe' | 'auto';
export type Platform = 'MT5' | 'cTrader';

/**
 * EA Registration File structure
 * Written by HedgeEdgeZMQ EA v2.1+ to Common\Files\HedgeEdge\{login}.json
 * Enables auto-discovery of running EAs and their assigned ports
 */
export interface EARegistration {
  login: string;
  broker: string;
  server: string;
  dataPort: number;
  commandPort: number;
  platform: string;
  autoPort: boolean;
  startTime: string;
  terminalPath: string;
  eaVersion: string;
  /** v3+: EA role — 'master' publishes events, 'slave' copies trades */
  role?: 'master' | 'slave';
  /** v3+: Whether the EA has CURVE encryption enabled */
  curveEnabled?: boolean;
  /** v3+: Server public key for CURVE (Z85-encoded, 40 chars) — only for master */
  curvePublicKey?: string;
  /** v3+: Whether the EA uses discrete event publishing (not snapshot diffing) */
  eventDriven?: boolean;
  /** v3+: Version string e.g. "3.0" */
  version?: string;
  /** v4+: Explicit control port for liveness gate (ZMQ PAIR).  Falls back to dataPort+2 / commandPort+2 */
  controlPort?: number;
}

export interface TerminalConfig {
  terminalId: string;
  platform: Platform;
  dataPath?: string;      // For file mode (MT5)
  dataPort?: number;      // For ZMQ mode (MT5)
  commandPort?: number;   // For ZMQ mode (MT5)
  controlPort?: number;   // For liveness gate (ZMQ PAIR)
  host?: string;          // For ZMQ mode (MT5)
  dataPipeName?: string;  // For pipe mode (cTrader)
  commandPipeName?: string; // For pipe mode (cTrader)
  instanceId?: string;    // For multiple cTrader instances
  mode: ChannelMode;
}

export class AgentChannelReader extends EventEmitter {
  private mt5DataPaths: Map<string, string> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastSnapshots: Map<string, AgentSnapshot> = new Map();
  private snapshotListeners: Set<(accountId: string, snapshot: AgentSnapshot) => void> = new Set();
  
  // ZMQ bridges for high-performance mode (MT5) - PRIMARY
  private zmqBridges: Map<string, ZmqBridge> = new Map();
  private zmqAvailable: boolean | null = null;
  private terminalConfigs: Map<string, TerminalConfig> = new Map();
  
  // Named Pipe clients for cTrader
  private pipeClients: Map<string, NamedPipeClient> = new Map();
  
  // Default ZMQ endpoints (match EA defaults)
  private static readonly DEFAULT_ZMQ_DATA_PORT = 51810;
  private static readonly DEFAULT_ZMQ_COMMAND_PORT = 51811;
  
  // ── Scan result cache ─────────────────────────────────────────────────
  // Prevents redundant TCP probes + filesystem reads when multiple IPC
  // handlers or the health-check timer trigger scans in quick succession.
  // Cache TTL: 2 seconds — short enough to detect new terminals promptly,
  // long enough to collapse bursts of concurrent scan requests.
  private static readonly SCAN_CACHE_TTL_MS = 2_000;
  private scanCacheResult: string[] | null = null;
  private scanCacheTimestamp = 0;
  
  // Fallback port ranges for scanning when no EA registration files exist.
  // Used ONLY as a last resort — the primary method is file-based discovery
  // via EA v2.1+ registration files. Limited to 4 pairs because >99% of
  // users run ≤4 MT5 terminals; power users use registration files.
  private static readonly FALLBACK_PORT_RANGES: Array<{ dataPort: number; commandPort: number; name: string }> = [
    { dataPort: 51810, commandPort: 51811, name: 'mt5-port-51810' },
    { dataPort: 51820, commandPort: 51821, name: 'mt5-port-51820' },
    { dataPort: 51830, commandPort: 51831, name: 'mt5-port-51830' },
    { dataPort: 51840, commandPort: 51841, name: 'mt5-port-51840' },
  ];
  
  // EA registration files directory (written by EA v2.1+ with auto-port)
  // Located at: %APPDATA%\MetaQuotes\Terminal\Common\Files\HedgeEdge\
  private static readonly EA_REGISTRATION_DIR = 'HedgeEdge';
  
  constructor() {
    super();
    // Check ZMQ availability on construction
    this.checkZmqAvailability();
    console.log('[AgentChannelReader] Initialized - ZeroMQ is PRIMARY communication method');
  }
  
  /**
   * Check if ZeroMQ is available
   */
  private async checkZmqAvailability(): Promise<void> {
    this.zmqAvailable = await isZmqAvailable();
    console.log(`[AgentChannelReader] ZMQ available: ${this.zmqAvailable}`);
  }
  
  /**
   * Get ZMQ availability status
   */
  isZmqAvailable(): boolean {
    return this.zmqAvailable === true;
  }
  
  /**
   * Get the path to the MT5 Common Files directory
   * All MT5 terminals share: %APPDATA%\MetaQuotes\Terminal\Common\Files\
   */
  private static getCommonFilesPath(): string {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA environment variable not set');
    }
    return path.join(appData, 'MetaQuotes', 'Terminal', 'Common', 'Files');
  }
  
  /**
   * Get the EA registration directory path
   */
  private static getRegistrationDirPath(): string {
    return path.join(AgentChannelReader.getCommonFilesPath(), AgentChannelReader.EA_REGISTRATION_DIR);
  }
  
  /**
   * Read EA registration files from the Common Files directory.
   * Each running EA (v2.1+) writes a JSON file: HedgeEdge/{login}.json
   * Contains: login, broker, server, dataPort, commandPort, platform, autoPort, startTime, terminalPath, eaVersion
   * 
   * Enhanced with port validation and stale-file detection:
   * - Validates port pairs are in expected ZMQ range
   * - Records file paths for staleness checks
   * - Cleans up stale registration files with dead ports
   * 
   * @returns Array of discovered EA registrations with port info
   */
  async readEARegistrationFiles(): Promise<(EARegistration & { _filePath?: string })[]> {
    const registrations: (EARegistration & { _filePath?: string })[] = [];
    
    try {
      const regDir = AgentChannelReader.getRegistrationDirPath();
      
      // Check if directory exists
      try {
        await fs.access(regDir);
      } catch {
        console.log(`[AgentChannelReader] No EA registration directory found at: ${regDir}`);
        console.log('[AgentChannelReader] EAs may be running older versions without auto-port support');
        return registrations;
      }
      
      // Clean stale registration files before reading
      const cleaned = await portManager.cleanStaleRegistrations(regDir);
      if (cleaned.length > 0) {
        console.log(`[AgentChannelReader] Cleaned ${cleaned.length} stale registration file(s): ${cleaned.join(', ')}`);
      }
      
      // Read all .json files in the registration directory
      const files = await fs.readdir(regDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      if (jsonFiles.length === 0) {
        console.log('[AgentChannelReader] No EA registration files found (no EAs running or using legacy mode)');
        return registrations;
      }
      
      console.log(`[AgentChannelReader] Found ${jsonFiles.length} EA registration file(s)`);
      
      // Read each registration file in parallel
      const readPromises = jsonFiles.map(async (file) => {
        try {
          const filePath = path.join(regDir, file);
          const buffer = await fs.readFile(filePath);
          let content: string;
          
          // Handle MQL5 file encoding (may have BOM)
          if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
            content = buffer.toString('utf16le').substring(1); // UTF-16 LE BOM
          } else if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
            content = buffer.toString('utf-8').substring(1); // UTF-8 BOM
          } else {
            content = buffer.toString('utf-8');
          }
          
          content = content.replace(/\0/g, '').trim();
          const reg = JSON.parse(content) as EARegistration;
          
          // Validate required fields
          // Slave EAs only have commandPort (no PUB socket / dataPort)
          if (!reg.login || !reg.commandPort) {
            console.warn(`[AgentChannelReader] Invalid registration file ${file}: missing required fields (login or commandPort)`);
            return null;
          }
          
          // Validate port range
          if (!portManager.isValidPort(reg.commandPort)) {
            console.warn(`[AgentChannelReader] Invalid command port in ${file}: cmd=${reg.commandPort}`);
            return null;
          }
          
          // For master EAs, also validate dataPort
          if (reg.role !== 'slave') {
            if (!reg.dataPort) {
              console.warn(`[AgentChannelReader] Master registration file ${file} missing dataPort`);
              return null;
            }
            if (!portManager.isValidPort(reg.dataPort)) {
              console.warn(`[AgentChannelReader] Invalid data port in ${file}: data=${reg.dataPort}`);
              return null;
            }
            if (reg.commandPort !== reg.dataPort + 1) {
              console.warn(`[AgentChannelReader] Non-adjacent port pair in ${file}: data=${reg.dataPort}, cmd=${reg.commandPort} (expected ${reg.dataPort + 1})`);
              // Continue anyway — EA might have custom config, but warn
            }
          }
          
          const portInfo = reg.dataPort ? `${reg.dataPort}/${reg.commandPort}` : `cmd=${reg.commandPort}`;
          console.log(`[AgentChannelReader] 📋 EA registered: login=${reg.login} broker=${reg.broker} role=${reg.role || 'unknown'} ports=${portInfo}`);
          return { ...reg, _filePath: filePath };
        } catch (err) {
          console.warn(`[AgentChannelReader] Failed to read registration file ${file}:`, err instanceof Error ? err.message : err);
          return null;
        }
      });
      
      const results = await Promise.all(readPromises);
      for (const reg of results) {
        if (reg) registrations.push(reg);
      }
      
    } catch (err) {
      console.warn('[AgentChannelReader] Error reading EA registration files:', err instanceof Error ? err.message : err);
    }
    
    return registrations;
  }
  
  /**
   * Get the list of port ranges for multi-account support
   * Primary: reads EA registration files (dynamic, scalable)
   * Fallback: returns static port ranges for legacy EAs
   */
  static getMultiAccountPortRanges(): Array<{ dataPort: number; commandPort: number; name: string }> {
    // Return fallback ranges for synchronous callers
    // For dynamic discovery, use readEARegistrationFiles() instead
    return AgentChannelReader.FALLBACK_PORT_RANGES;
  }
  
  /**
   * Scan for MT5 terminals and connect to them.
   * 
   * IMPROVED STRATEGY (v2.2):
   * ─────────────────────────
   * 1. MUTEX: Acquire scan lock — prevents duplicate bridges from concurrent calls
   * 2. CLEAN: Remove stale registration files (crash recovery)
   * 3. DISCOVER: Read EA registration files + fallback port list
   * 4. TCP-PROBE: Fast parallel probe (~150ms) to find live ports
   *    → Only ports that respond to TCP get ZMQ bridges (no zombie bridges)
   * 5. CONNECT: Create ZMQ bridges only for live ports
   * 6. VERIFY: Wait for PUB/SUB events or PING, disconnect dead ones
   * 7. REGISTER: Track all ports in the central PortManager
   * 
   * @param force - Skip the scan-result cache (use for explicit user-initiated refreshes)
   * @returns Array of terminal IDs that were successfully connected
   */
  async scanAndConnectAllMT5Terminals(force = false): Promise<string[]> {
    // ═══════════════════════════════════════════════════════════════
    // Phase 0a: Return cached results if still fresh (debounce)
    // Collapses rapid back-to-back calls from multiple IPC handlers
    // or the health-check timer into a single actual scan.
    // ═══════════════════════════════════════════════════════════════
    if (!force && this.scanCacheResult !== null) {
      const age = Date.now() - this.scanCacheTimestamp;
      if (age < AgentChannelReader.SCAN_CACHE_TTL_MS) {
        console.log(`[AgentChannelReader] Using cached scan results (age: ${age}ms, ${this.scanCacheResult.length} terminal(s))`);
        return this.scanCacheResult;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Phase 0b: Acquire scan mutex (prevents race conditions)
    // ═══════════════════════════════════════════════════════════════
    const releaseLock = await portManager.acquireScanLock();
    if (!releaseLock) {
      console.warn('[AgentChannelReader] Could not acquire scan lock (another scan may be stuck)');
      // Return currently connected terminals instead of empty
      return Array.from(this.zmqBridges.entries())
        .filter(([, bridge]) => bridge.isConnected())
        .map(([id]) => id);
    }
    
    const connectedTerminals: string[] = [];
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // Phase 1: Read EA registration files (primary discovery)
      // Registration files are cleaned of stale entries inside readEARegistrationFiles()
      // ═══════════════════════════════════════════════════════════════
      let candidates: Array<{ dataPort: number; commandPort: number; controlPort?: number; name: string; source: 'registration' | 'fallback'; role?: 'master' | 'slave'; curveEnabled?: boolean; curveServerKey?: string }> = [];
      let slaveCandidates: Array<{ commandPort: number; controlPort?: number; name: string; source: 'registration'; role: 'slave'; curveEnabled?: boolean }> = [];
      const discoveredPorts = new Set<number>();
      
      try {
        const registrations = await this.readEARegistrationFiles();
        
        if (registrations.length > 0) {
          console.log(`[AgentChannelReader] 🔍 Discovered ${registrations.length} EA(s) via registration files`);
          
          for (const reg of registrations) {
            const name = `mt5-${reg.login}`;
            
            // Slave EAs: command-only (no PUB socket)
            if (reg.role === 'slave' && !reg.dataPort) {
              slaveCandidates.push({
                commandPort: reg.commandPort,
                controlPort: reg.controlPort,
                name,
                source: 'registration',
                role: 'slave',
                curveEnabled: reg.curveEnabled,
              });
              discoveredPorts.add(reg.commandPort);
              continue;
            }
            
            // Master EAs: full PUB/SUB + REQ/REP
            candidates.push({
              dataPort: reg.dataPort,
              commandPort: reg.commandPort,
              controlPort: reg.controlPort,
              name,
              source: 'registration',
              role: reg.role,
              curveEnabled: reg.curveEnabled,
              curveServerKey: reg.curvePublicKey,
            });
            discoveredPorts.add(reg.dataPort);
          }
        }
      } catch (err) {
        console.warn('[AgentChannelReader] Registration file discovery failed:', err instanceof Error ? err.message : err);
      }
      
      // Fallback port scan ONLY if no registration files found
      if (discoveredPorts.size === 0) {
        console.log('[AgentChannelReader] No registration files found — falling back to port scan');
        for (const fallback of AgentChannelReader.FALLBACK_PORT_RANGES) {
          candidates.push({ ...fallback, source: 'fallback' });
        }
      }
      
      // ═══════════════════════════════════════════════════════════════
      // Phase 2: Fast TCP probe — filter to only live ports (~150ms)
      // This eliminates the old 7-second blind wait and prevents
      // creating ZMQ bridges to dead ports (which would leak sockets)
      // ═══════════════════════════════════════════════════════════════
      // First, include truly alive terminals in the result (use isAlive not isConnected)
      // and clean up stale bridges that are socket-connected but no longer receiving data
      const alreadyConnected = new Set<string>();
      const staleBridges: string[] = [];
      for (const [name, bridge] of this.zmqBridges) {
        if (bridge.isAlive()) {
          connectedTerminals.push(name);
          alreadyConnected.add(name);
        } else if (bridge.isConnected() && !bridge.isAlive()) {
          // Socket is open but no data received recently = stale/dead bridge
          staleBridges.push(name);
        }
      }
      
      // Clean up stale bridges so they don't block reconnection to same ports
      for (const staleId of staleBridges) {
        console.log(`[AgentChannelReader] Cleaning up stale bridge: ${staleId} (socket open but no data)`);
        await this.safeDisconnectMT5(staleId);
      }
      
      // Remove candidates that already have active bridges
      candidates = candidates.filter(c => !alreadyConnected.has(c.name));
      
      if (candidates.length === 0 && slaveCandidates.length === 0) {
        console.log(`[AgentChannelReader] All known ports already connected (${connectedTerminals.length} terminal(s))`);
        return connectedTerminals;
      }
      
      if (candidates.length > 0) {
      console.log(`[AgentChannelReader] TCP-probing ${candidates.length} port(s) (${discoveredPorts.size} from registration, ${candidates.length - discoveredPorts.size} fallback)`);
      const scanResults = await portManager.discoverLivePorts(candidates);
      const livePorts = scanResults.filter(r => r.alive);
      const deadPorts = scanResults.filter(r => !r.alive);
      
      if (deadPorts.length > 0) {
        console.log(`[AgentChannelReader] Skipping ${deadPorts.length} dead port(s): ${deadPorts.map(d => d.dataPort).join(', ')}`);
      }
      
      if (livePorts.length > 0) {
      
      // ═══════════════════════════════════════════════════════════════
      // Phase 3: Connect ONLY to live ports (no zombie bridges)
      // ═══════════════════════════════════════════════════════════════
      console.log(`[AgentChannelReader] Connecting to ${livePorts.length} live port(s)...`);
      
      const connectionPromises = livePorts.map(async (scanResult) => {
        // Register port allocations
        portManager.allocate(scanResult.dataPort, 'zmq-data', scanResult.terminalId);
        portManager.allocate(scanResult.commandPort, 'zmq-command', scanResult.terminalId);
        portManager.markVerified(scanResult.dataPort);
        
        try {
          const connected = await this.connectMT5(scanResult.terminalId, {
            dataPort: scanResult.dataPort,
            commandPort: scanResult.commandPort,
            controlPort: scanResult.controlPort,
            role: scanResult.role,
            curveEnabled: scanResult.curveEnabled,
            curveServerKey: scanResult.curveServerKey,
          });
          return { scanResult, connected };
        } catch (error) {
          // Release ports on failure
          portManager.release(scanResult.dataPort);
          portManager.release(scanResult.commandPort);
          return { scanResult, connected: false };
        }
      });
      
      const results = await Promise.all(connectionPromises);
      
      // ═══════════════════════════════════════════════════════════════
      // Phase 4: Wait briefly for PUB/SUB events, then verify via PING
      // Reduced from 7s to 3s since we already know ports are alive
      // ═══════════════════════════════════════════════════════════════
      const newConnections = results.filter(r => r.connected);
      if (newConnections.length > 0) {
        console.log(`[AgentChannelReader] Waiting for PUB/SUB events from ${newConnections.length} new connection(s)...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // ═══════════════════════════════════════════════════════════════
      // Phase 5: Verify connections and clean up dead ones
      // ═══════════════════════════════════════════════════════════════
      for (const result of results) {
        if (!result.connected) continue;
        
        const bridge = this.zmqBridges.get(result.scanResult.terminalId);
        if (!bridge) continue;
        
        const status = bridge.getStatus();
        const hasEvents = status.eventsReceived > 0;
        const hasAccountState = bridge.getCachedAccountState() !== null;
        
        if (hasEvents || hasAccountState) {
          console.log(`[AgentChannelReader] ✅ EA detected on ${result.scanResult.terminalId} via PUB/SUB (events: ${status.eventsReceived})`);
          connectedTerminals.push(result.scanResult.terminalId);
        } else {
          // No PUB events yet — try PING as final check
          console.log(`[AgentChannelReader] No PUB events on ${result.scanResult.terminalId}, trying PING...`);
          try {
            const alive = await bridge.ping();
            if (alive) {
              console.log(`[AgentChannelReader] ✅ EA detected on ${result.scanResult.terminalId} via PING`);
              connectedTerminals.push(result.scanResult.terminalId);
              this.requestInitialStateFromBridge(bridge, result.scanResult.terminalId);
            } else {
              console.log(`[AgentChannelReader] No EA on ${result.scanResult.terminalId}, disconnecting`);
              await this.safeDisconnectMT5(result.scanResult.terminalId);
            }
          } catch {
            console.log(`[AgentChannelReader] No EA on ${result.scanResult.terminalId} (PING timeout), disconnecting`);
            await this.safeDisconnectMT5(result.scanResult.terminalId);
          }
        }
      }
      
      } // end if (livePorts.length > 0)
      } // end if (candidates.length > 0)
      
      // ═══════════════════════════════════════════════════════════════
      // Phase 6: Connect to SLAVE EAs (command-only, no PUB socket)
      // Slaves only expose a REP socket for app commands & STATUS queries.
      // We TCP-probe their commandPort and connect with polling.
      // ═══════════════════════════════════════════════════════════════
      slaveCandidates = slaveCandidates.filter(c => !alreadyConnected.has(c.name));
      
      if (slaveCandidates.length > 0) {
        console.log(`[AgentChannelReader] Probing ${slaveCandidates.length} slave EA(s) (command-only)...`);
        
        const slaveProbes = await Promise.all(
          slaveCandidates.map(async (c) => {
            const alive = await portManager.tcpProbe(c.commandPort);
            return { ...c, alive };
          })
        );
        
        for (const slave of slaveProbes) {
          if (!slave.alive) {
            console.log(`[AgentChannelReader] Slave ${slave.name} command port ${slave.commandPort} not responding, skipping`);
            continue;
          }
          
          try {
            portManager.allocate(slave.commandPort, 'zmq-command', slave.name);
            portManager.markVerified(slave.commandPort);
            
            const connected = await this.connectMT5Slave(slave.name, {
              commandPort: slave.commandPort,
              controlPort: slave.controlPort,
              curveEnabled: slave.curveEnabled,
            });
            
            if (connected) {
              console.log(`[AgentChannelReader] ✅ Slave EA detected on ${slave.name} (command port ${slave.commandPort})`);
              connectedTerminals.push(slave.name);
            } else {
              portManager.release(slave.commandPort);
            }
          } catch (error) {
            console.warn(`[AgentChannelReader] Failed to connect slave ${slave.name}:`, error instanceof Error ? error.message : error);
            portManager.release(slave.commandPort);
          }
        }
      }
      
      console.log(`[AgentChannelReader] Scan complete: ${connectedTerminals.length} terminal(s) connected`);
      
      // Cache the results so rapid follow-up calls skip the full scan
      this.scanCacheResult = [...connectedTerminals];
      this.scanCacheTimestamp = Date.now();
    } finally {
      // Always release the scan lock
      releaseLock();
    }
    
    return connectedTerminals;
  }
  
  /**
   * Safe disconnect that always cleans up port allocations and bridge references,
   * even if the underlying bridge.stop() throws.
   */
  private async safeDisconnectMT5(terminalId: string): Promise<void> {
    // Clean up slave polling timer if present
    const slavePollKey = `slave-${terminalId}`;
    const pollTimer = this.pollingIntervals.get(slavePollKey);
    if (pollTimer) {
      clearInterval(pollTimer);
      this.pollingIntervals.delete(slavePollKey);
    }
    
    try {
      await this.disconnectMT5(terminalId);
    } catch (error) {
      console.error(`[AgentChannelReader] Error during disconnect of ${terminalId}, force-cleaning:`, error);
      // Force cleanup even if stop() threw
      this.zmqBridges.delete(terminalId);
      this.lastSnapshots.delete(terminalId);
      this.terminalConfigs.delete(terminalId);
    }
    // Always release port allocations
    portManager.releaseByLabel(terminalId);
  }
  
  /**
   * Request initial account state from a confirmed-alive bridge
   * Called after PING confirms EA is present but no PUB events yet
   * This is a one-time fetch to populate the UI, NOT ongoing polling
   */
  private async requestInitialStateFromBridge(bridge: ZmqBridge, terminalId: string): Promise<void> {
    try {
      const response = await bridge.sendCommand({ action: 'STATUS' });
      // The EA's STATUS response is the full snapshot JSON at the top level
      // (it may NOT have a "success" field - check for accountId/broker directly)
      const accountData = (response.success && response.data) ? response.data as any : response as any;
      if (accountData && (accountData.broker || accountData.accountId)) {
          // Build an AgentSnapshot from the response
          const snapshot: AgentSnapshot = {
            timestamp: new Date().toISOString(),
            platform: 'MT5',
            accountId: accountData.accountId || '0',
            broker: accountData.broker,
            server: accountData.server,
            balance: accountData.balance ?? 0,
            equity: accountData.equity ?? 0,
            margin: accountData.margin ?? 0,
            freeMargin: accountData.freeMargin ?? 0,
            marginLevel: accountData.marginLevel ?? 0,
            floatingPnL: accountData.floatingPnL ?? 0,
            currency: accountData.currency || 'USD',
            leverage: accountData.leverage ?? 0,
            status: accountData.status || 'Active',
            isLicenseValid: accountData.isLicenseValid ?? true,
            isPaused: accountData.isPaused ?? false,
            lastError: accountData.lastError ?? null,
            positions: (accountData.positions || []).map((p: any) => ({
              id: p.id,
              symbol: p.symbol,
              volume: p.volume,
              volumeLots: p.volumeLots,
              side: p.side,
              entryPrice: p.entryPrice,
              currentPrice: p.currentPrice,
              stopLoss: p.stopLoss,
              takeProfit: p.takeProfit,
              profit: p.profit,
              swap: p.swap,
              commission: p.commission,
              openTime: p.openTime,
              comment: p.comment,
            })),
          };
          this.lastSnapshots.set(terminalId, snapshot);
          this.notifyListeners(terminalId, snapshot);
          this.emit('accountUpdate', terminalId, snapshot);
          console.log(`[AgentChannelReader] Initial state loaded for ${terminalId}: ${snapshot.accountId} @ ${snapshot.broker}`);
      }
    } catch (error) {
      console.warn(`[AgentChannelReader] Failed to get initial state for ${terminalId}:`, error instanceof Error ? error.message : error);
    }
  }
  
  /**
   * Disconnect from an MT5 terminal.
   * Also releases port allocations in the central PortManager.
   */
  async disconnectMT5(terminalId: string): Promise<void> {
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge) {
      try {
        await bridge.stop();
      } catch (error) {
        console.error(`[AgentChannelReader] Error stopping bridge for ${terminalId}:`, error);
      }
      this.zmqBridges.delete(terminalId);
      this.lastSnapshots.delete(terminalId);
      this.terminalConfigs.delete(terminalId);
      portManager.releaseByLabel(terminalId);
      
      // Invalidate scan cache so the next scan doesn't return stale data
      // that still includes this now-dead terminal
      this.scanCacheResult = null;
      this.scanCacheTimestamp = 0;
      
      console.log(`[AgentChannelReader] Disconnected from ${terminalId}`);
    }
  }
  
  /**
   * Check if Named Pipes are available (cTrader cBot running)
   */
  async isCTraderAvailable(): Promise<boolean> {
    return isCTraderPipeAvailable();
  }
  
  /**
   * PREFERRED: Connect to MT5 terminal via ZeroMQ (Event-Driven)
   * This is the primary method for MT5 communication.
   * Uses event-driven architecture - NO polling or snapshots.
   * 
   * @param terminalId - Unique identifier for this terminal
   * @param options - ZMQ connection options (ports default to 51810/51811)
   * @returns true if connection successful
   */
  async connectMT5(
    terminalId: string,
    options: {
      dataPort?: number;
      commandPort?: number;
      controlPort?: number;
      host?: string;
      /** Role of the EA (master or slave) — affects bridge config */
      role?: 'master' | 'slave';
      /** Enable CURVE encryption */
      curveEnabled?: boolean;
      /** Server public key for CURVE (from registration file) */
      curveServerKey?: string;
    } = {}
  ): Promise<boolean> {
    const dataPort = options.dataPort || AgentChannelReader.DEFAULT_ZMQ_DATA_PORT;
    const commandPort = options.commandPort || AgentChannelReader.DEFAULT_ZMQ_COMMAND_PORT;
    const host = options.host || '127.0.0.1';
    const role = options.role || 'unknown';
    
    console.log(`[AgentChannelReader] Connecting to MT5 via ZeroMQ (event-driven, role: ${role})...`);
    console.log(`  Data endpoint: tcp://${host}:${dataPort}`);
    console.log(`  Command endpoint: tcp://${host}:${commandPort}`);
    if (options.curveEnabled) console.log(`  CURVE: enabled`);
    
    // Check ZMQ availability first
    if (!this.zmqAvailable) {
      await this.checkZmqAvailability();
    }
    
    if (!this.zmqAvailable) {
      console.error('[AgentChannelReader] ZeroMQ not available - install zeromq package');
      return false;
    }
    
    const config: TerminalConfig = {
      terminalId,
      platform: 'MT5',
      dataPort,
      commandPort,
      controlPort: options.controlPort,
      host,
      mode: 'zmq',
    };
    
    try {
      const bridge = createZmqBridgeForPorts(dataPort, commandPort, host);
      
      // Apply v3 config (role, CURVE)
      (bridge as any).config.role = role;
      if (options.curveEnabled && options.curveServerKey) {
        (bridge as any).config.curveEnabled = true;
        (bridge as any).config.curveServerKey = options.curveServerKey;
      }
      
      // Set up event-driven handlers
      this.setupEventDrivenHandlers(bridge, terminalId);
      
      // Start the bridge
      const started = await bridge.start();
      
      if (started) {
        this.zmqBridges.set(terminalId, bridge);
        this.terminalConfigs.set(terminalId, config);
        console.log(`[AgentChannelReader] ✅ Connected to MT5 ${terminalId} via ZeroMQ (event-driven, role: ${role})`);
        return true;
      } else {
        console.error(`[AgentChannelReader] Failed to start ZMQ bridge for ${terminalId}`);
        return false;
      }
    } catch (error) {
      console.error(`[AgentChannelReader] Error connecting to MT5 ${terminalId}:`, error);
      return false;
    }
  }
  
  /**
   * Connect to an MT5 SLAVE EA via command-only ZMQ (REP socket).
   * Slave EAs don't have a PUB socket — they only expose a REP socket
   * for app commands (STATUS, PAUSE, RESUME, CLOSE_ALL, etc.).
   * We create a bridge with only a REQ socket and poll STATUS periodically.
   */
  async connectMT5Slave(
    terminalId: string,
    options: {
      commandPort: number;
      controlPort?: number;
      host?: string;
      curveEnabled?: boolean;
      curveServerKey?: string;
      pollIntervalMs?: number;
    }
  ): Promise<boolean> {
    const commandPort = options.commandPort;
    const host = options.host || '127.0.0.1';
    const pollIntervalMs = options.pollIntervalMs || 5000; // Poll every 5s
    
    // ─── CRITICAL: Clean up any existing bridge/polling for this slave ───
    // Without this, every reconnect scan leaks a ZMQ REQ socket + poll timer
    if (this.zmqBridges.has(terminalId)) {
      console.log(`[AgentChannelReader] Cleaning up existing slave bridge for ${terminalId} before reconnect`);
      await this.safeDisconnectMT5(terminalId);
    }
    
    console.log(`[AgentChannelReader] Connecting to MT5 SLAVE via command-only ZMQ...`);
    console.log(`  Command endpoint: tcp://${host}:${commandPort}`);
    
    if (!this.zmqAvailable) {
      await this.checkZmqAvailability();
    }
    if (!this.zmqAvailable) {
      console.error('[AgentChannelReader] ZeroMQ not available - install zeromq package');
      return false;
    }
    
    const config: TerminalConfig = {
      terminalId,
      platform: 'MT5',
      commandPort,
      controlPort: options.controlPort,
      host,
      mode: 'zmq',
    };
    
    try {
      // Create a bridge with a dummy dataPort (we won't use the SUB socket)
      // The bridge's REQ socket on commandPort is what we actually use
      const bridge = createZmqBridgeForPorts(0, commandPort, host);
      (bridge as any).config.role = 'slave';  // Mark as slave so isConnected/isAlive work correctly
      
      // Override start() behavior — only connect command socket, skip data socket
      // We do this by directly initializing the zmq module and command socket
      const zmq = await import(/* webpackIgnore: true */ 'zeromq');
      (bridge as any).zmq = zmq;
      (bridge as any).isRunning = true;
      
      // Create only the REQ socket (no SUB socket for slaves)
      const reqSocket = new zmq.Request();
      reqSocket.sendTimeout = 5000;
      reqSocket.receiveTimeout = 5000;
      reqSocket.linger = 0;
      
      const endpoint = `tcp://${host}:${commandPort}`;
      reqSocket.connect(endpoint);
      (bridge as any).reqSocket = reqSocket;
      (bridge as any).status.commandSocket = 'connected';
      
      console.log(`[AgentChannelReader] Slave command socket connected to ${endpoint}`);
      
      // Try initial STATUS to verify the slave is responding
      this.zmqBridges.set(terminalId, bridge);
      this.terminalConfigs.set(terminalId, config);
      
      // Fetch initial state
      const initialState = await this.fetchSlaveState(bridge, terminalId);
      if (!initialState) {
        console.warn(`[AgentChannelReader] Slave ${terminalId} didn't respond to STATUS, disconnecting`);
        await this.safeDisconnectMT5(terminalId);
        return false;
      }
      
      // Start periodic polling for slave account state
      const pollTimer = setInterval(async () => {
        try {
          // Check if bridge still exists (may have been disconnected)
          if (!this.zmqBridges.has(terminalId)) {
            clearInterval(pollTimer);
            this.pollingIntervals.delete(`slave-${terminalId}`);
            return;
          }
          await this.fetchSlaveState(bridge, terminalId);
        } catch (err) {
          console.warn(`[AgentChannelReader] Slave poll error for ${terminalId}:`, err instanceof Error ? err.message : err);
        }
      }, pollIntervalMs);
      
      this.pollingIntervals.set(`slave-${terminalId}`, pollTimer);
      
      console.log(`[AgentChannelReader] ✅ Connected to slave ${terminalId} (poll every ${pollIntervalMs}ms)`);
      return true;
    } catch (error) {
      console.error(`[AgentChannelReader] Error connecting to slave ${terminalId}:`, error);
      return false;
    }
  }
  
  /**
   * Fetch account state from a slave EA via STATUS command
   */
  private async fetchSlaveState(bridge: ZmqBridge, terminalId: string): Promise<AgentSnapshot | null> {
    try {
      const response = await bridge.sendCommand({ action: 'STATUS' });
      const data = (response as any);
      
      if (!data || (!data.broker && !data.accountId)) {
        return null;
      }
      
      // Mark the bridge as alive so isAlive() returns true for slaves
      // (slaves don't receive PUB/SUB events, only polled STATUS responses)
      bridge.markAlive();
      
      const snapshot: AgentSnapshot = {
        timestamp: data.timestamp || new Date().toISOString(),
        platform: 'MT5',
        accountId: data.accountId || '0',
        broker: data.broker || 'Unknown',
        server: data.server,
        balance: data.balance ?? 0,
        equity: data.equity ?? 0,
        margin: data.margin ?? 0,
        freeMargin: data.freeMargin ?? 0,
        marginLevel: data.marginLevel ?? 0,
        floatingPnL: data.floatingPnL ?? 0,
        currency: data.currency || 'USD',
        leverage: data.leverage ?? 0,
        status: data.status || 'Active',
        isLicenseValid: data.isLicenseValid ?? true,
        isPaused: data.isPaused ?? false,
        lastError: data.lastError ?? null,
        positions: (data.positions || []).map((p: any) => ({
          id: p.id,
          symbol: p.symbol,
          volume: p.volume,
          volumeLots: p.volumeLots,
          side: p.side,
          entryPrice: p.entryPrice,
          currentPrice: p.currentPrice,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          profit: p.profit,
          swap: p.swap,
          commission: p.commission,
          openTime: p.openTime,
          comment: p.comment,
        })),
      };
      
      const isNew = !this.lastSnapshots.has(terminalId);
      const previousSnapshot = this.lastSnapshots.get(terminalId);
      this.lastSnapshots.set(terminalId, snapshot);
      
      if (isNew) {
        // First time — emit connection event so UI sees the account
        this.notifyListeners(terminalId, snapshot);
        this.emit('accountUpdate', terminalId, snapshot);
        this.emit('terminalConnected', terminalId, 'MT5');
        console.log(`[AgentChannelReader] Slave state loaded: ${snapshot.accountId} @ ${snapshot.broker}`);
      } else if (previousSnapshot) {
        // ── Diff positions to detect opens/closes on the slave terminal ──
        // Slave EAs don't have a PUB socket, so the only way to detect
        // trade events is by comparing successive STATUS poll results.
        const oldPositions = previousSnapshot.positions || [];
        const newPositions = snapshot.positions || [];
        const oldIds = new Set(oldPositions.map(p => p.id));
        const newIds = new Set(newPositions.map(p => p.id));

        // Positions present before but missing now → closed
        for (const pos of oldPositions) {
          if (!newIds.has(pos.id)) {
            const closedEvent = {
              type: 'POSITION_CLOSED',
              eventIndex: 0,
              timestamp: snapshot.timestamp,
              platform: 'MT5',
              accountId: snapshot.accountId,
              data: {
                position: Number(pos.id) || 0,
                symbol: pos.symbol,
                volume: pos.volumeLots ?? pos.volume,
                price: pos.currentPrice,
                profit: pos.profit,
                swap: pos.swap ?? 0,
                commission: pos.commission ?? 0,
                type: pos.side as 'BUY' | 'SELL',
                entry: 'OUT' as const,
              },
            };
            console.log(`[AgentChannelReader] Slave position closed (poll diff): ${pos.symbol} #${pos.id} profit=${pos.profit}`);
            this.emit('positionClosed', terminalId, closedEvent);
          }
        }

        // Positions absent before but present now → opened
        for (const pos of newPositions) {
          if (!oldIds.has(pos.id)) {
            const openedEvent = {
              type: 'POSITION_OPENED',
              eventIndex: 0,
              timestamp: snapshot.timestamp,
              platform: 'MT5',
              accountId: snapshot.accountId,
              data: {
                position: Number(pos.id) || 0,
                symbol: pos.symbol,
                volume: pos.volumeLots ?? pos.volume,
                price: pos.entryPrice,
                type: pos.side as 'BUY' | 'SELL',
                entry: 'IN' as const,
              },
            };
            console.log(`[AgentChannelReader] Slave position opened (poll diff): ${pos.symbol} #${pos.id}`);
            this.emit('positionOpened', terminalId, openedEvent);
          }
        }
      }
      
      return snapshot;
    } catch (error) {
      console.warn(`[AgentChannelReader] Failed to fetch slave state for ${terminalId}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }
  
  /**
   * @deprecated Use connectMT5() instead - file mode is deprecated
   * Register an MT5 terminal for monitoring (legacy file mode)
   */
  registerMT5Terminal(terminalId: string, dataPath: string): void {
    console.warn(`[AgentChannelReader] ⚠️ File mode is deprecated - use connectMT5() for ZeroMQ`);
    this.mt5DataPaths.set(terminalId, dataPath);
    this.terminalConfigs.set(terminalId, {
      terminalId,
      platform: 'MT5',
      dataPath,
      mode: 'file',
    });
    console.log(`[AgentChannelReader] Registered MT5 terminal (file mode): ${terminalId}`);
  }
  
  /**
   * Register a cTrader terminal for monitoring via Named Pipes
   */
  async registerCTraderTerminal(
    terminalId: string,
    options: {
      instanceId?: string;
      dataPipeName?: string;
      commandPipeName?: string;
    } = {}
  ): Promise<boolean> {
    // Create config
    const config: TerminalConfig = {
      terminalId,
      platform: 'cTrader',
      instanceId: options.instanceId,
      dataPipeName: options.dataPipeName || 
        (options.instanceId ? `\\\\.\\pipe\\HedgeEdgeCTrader_${options.instanceId}` : DEFAULT_NAMED_PIPE_CONFIG.dataPipeName),
      commandPipeName: options.commandPipeName || 
        (options.instanceId ? `\\\\.\\pipe\\HedgeEdgeCTrader_Commands_${options.instanceId}` : DEFAULT_NAMED_PIPE_CONFIG.commandPipeName),
      mode: 'pipe',
    };
    
    this.terminalConfigs.set(terminalId, config);
    
    try {
      // Create Named Pipe client
      const client = options.instanceId 
        ? createNamedPipeClientForInstance(options.instanceId)
        : createNamedPipeClient({
            dataPipeName: config.dataPipeName,
            commandPipeName: config.commandPipeName,
          });
      
      // Set up event handlers
      client.on('snapshot', (snapshot: CTraderSnapshot) => {
        // Convert cTrader snapshot to agent snapshot format
        const agentSnapshot = this.convertCTraderSnapshot(snapshot);
        this.lastSnapshots.set(terminalId, agentSnapshot);
        this.notifyListeners(terminalId, agentSnapshot);
      });
      
      client.on('goodbye', () => {
        console.log(`[AgentChannelReader] cTrader ${terminalId} disconnected`);
        // Named pipe client will auto-reconnect
      });
      
      client.on('error', (error: Error) => {
        console.error(`[AgentChannelReader] Named Pipe error for ${terminalId}:`, error.message);
      });
      
      client.on('connected', () => {
        console.log(`[AgentChannelReader] cTrader ${terminalId} connected`);
      });
      
      client.on('disconnected', () => {
        console.log(`[AgentChannelReader] cTrader ${terminalId} pipe disconnected, will reconnect...`);
      });
      
      // Try to start the client
      const started = await client.start();
      
      if (started) {
        this.pipeClients.set(terminalId, client);
        console.log(`[AgentChannelReader] Registered cTrader terminal (Named Pipe mode): ${terminalId}`);
        return true;
      }
    } catch (error) {
      console.warn(`[AgentChannelReader] Failed to start Named Pipe client for ${terminalId}:`, error);
      // Client will continue trying to reconnect in background
      return true; // Still consider it "registered" as it will auto-reconnect
    }
    
    return false;
  }
  
  /**
   * Convert cTrader snapshot to AgentSnapshot format
   */
  private convertCTraderSnapshot(ctraderSnapshot: CTraderSnapshot): AgentSnapshot {
    return {
      timestamp: ctraderSnapshot.timestamp,
      platform: 'cTrader',
      accountId: ctraderSnapshot.accountId,
      broker: ctraderSnapshot.broker,
      balance: ctraderSnapshot.balance,
      equity: ctraderSnapshot.equity,
      margin: ctraderSnapshot.margin,
      freeMargin: ctraderSnapshot.freeMargin,
      marginLevel: ctraderSnapshot.marginLevel || 0,
      floatingPnL: ctraderSnapshot.floatingPnL,
      currency: ctraderSnapshot.currency,
      leverage: ctraderSnapshot.leverage,
      status: ctraderSnapshot.status,
      isLicenseValid: ctraderSnapshot.isLicenseValid,
      isPaused: ctraderSnapshot.isPaused,
      lastError: ctraderSnapshot.lastError,
      positions: ctraderSnapshot.positions, // Same canonical Position type — no mapping needed
    };
  }
  
  /**
   * Set up event-driven handlers for the ZMQ bridge
   * 
   * EFFICIENCY MODEL (inspired by Heron Copier):
   * - TRADE EVENTS (position open/close/modify) → emit IMMEDIATELY (for hedge execution)
   * - ACCOUNT DATA (balance, equity, prices) → cache silently, serve on-demand
   * - HEARTBEATS → cache silently as keepalive proof, no UI push
   * - UI refreshes account data every 30s or on manual "Refresh" button
   */
  private setupEventDrivenHandlers(bridge: ZmqBridge, terminalId: string): void {
    // Connection events - emit immediately (important state changes)
    bridge.on('connected', (event: ZmqEvent) => {
      const snapshot = this.convertZmqEventToSnapshot(event);
      this.lastSnapshots.set(terminalId, snapshot);
      this.notifyListeners(terminalId, snapshot);
      this.emit('terminalConnected', terminalId, 'MT5');
      
      // ─── HISTORICAL DEALS: Fetch closed-trade history after a short delay ───
      // Delay to avoid blocking the command queue during initial connection
      // handshake (STATUS, PING etc. need to go through first)
      setTimeout(() => {
        bridge.getHistory(3650).then((result) => {
          const deals = result.deals;
          if (deals && deals.length > 0) {
            const emitId = result.accountId ? `mt5-${result.accountId}` : terminalId;
            console.log(`[AgentChannelReader] Fetched ${deals.length} historical deals for terminal ${terminalId} → emitting as ${emitId}`);
            this.emit('tradeHistory', emitId, deals);
          } else {
            console.log(`[AgentChannelReader] No historical deals returned for terminal ${terminalId}`);
          }
        }).catch((err) => {
          console.warn(`[AgentChannelReader] Failed to fetch trade history for ${terminalId}:`, err);
        });
      }, 5000); // Wait 5s after connection before fetching history
    });
    
    bridge.on('disconnected', (event: ZmqEvent) => {
      this.emit('terminalDisconnected', terminalId, 'MT5');
    });
    
    bridge.on('goodbye', () => {
      this.emit('terminalDisconnected', terminalId, 'MT5');
    });
    
    // ─── SILENT CACHING: Heartbeat & Account Updates ───────────────────
    // These arrive at high frequency (every 1-2s). We cache the data
    // silently so getLastSnapshot() returns fresh data, but we do NOT
    // emit events or push to the UI. The UI reads from cache on its
    // 30-second refresh timer or when the user clicks "Refresh".
    
    bridge.on('heartbeat', (event: ZmqEvent) => {
      const heartbeatData = event.data as ZmqHeartbeatData;
      if (heartbeatData) {
        const existingSnapshot = this.lastSnapshots.get(terminalId);
        if (existingSnapshot) {
          existingSnapshot.balance = heartbeatData.balance;
          existingSnapshot.equity = heartbeatData.equity;
          existingSnapshot.floatingPnL = heartbeatData.profit;
          existingSnapshot.isLicenseValid = heartbeatData.isLicenseValid;
          existingSnapshot.isPaused = heartbeatData.isPaused;
          if (heartbeatData.margin !== undefined) existingSnapshot.margin = heartbeatData.margin;
          if (heartbeatData.freeMargin !== undefined) existingSnapshot.freeMargin = heartbeatData.freeMargin;
          if (heartbeatData.positions && heartbeatData.positions.length >= 0) {
            // Same canonical Position type — pass through directly
            existingSnapshot.positions = heartbeatData.positions;
          }
          existingSnapshot.timestamp = event.timestamp;
          this.lastSnapshots.set(terminalId, existingSnapshot);
          // NO emit - silent cache only
        }
      }
      // Emit lightweight heartbeat for health-check tracking only (no UI push)
      this.emit('heartbeat', terminalId, event);
    });
    
    bridge.on('accountUpdate', (event: ZmqEvent) => {
      // Silently cache the full account state
      const snapshot = this.convertZmqEventToSnapshot(event);
      this.lastSnapshots.set(terminalId, snapshot);
      // NO emit to main.ts - UI refreshes on timer or manual trigger
    });
    
    // ─── IMMEDIATE EVENTS: Trade Actions ──────────────────────────────
    // These are CRITICAL for hedge execution and must be forwarded instantly.
    // Position events trigger the copier/hedge logic in the app.
    
    bridge.on('positionOpened', (event: ZmqEvent) => {
      this.emit('positionOpened', terminalId, event);
    });
    
    bridge.on('positionClosed', (event: ZmqEvent) => {
      this.emit('positionClosed', terminalId, event);
    });
    
    bridge.on('positionModified', (event: ZmqEvent) => {
      this.emit('positionModified', terminalId, event);
    });
    
    bridge.on('positionReversed', (event: ZmqEvent) => {
      this.emit('positionReversed', terminalId, event);
    });
    
    // Order events - immediate (affects trade state)
    bridge.on('orderPlaced', (event: ZmqEvent) => {
      this.emit('orderPlaced', terminalId, event);
    });
    
    bridge.on('orderCancelled', (event: ZmqEvent) => {
      this.emit('orderCancelled', terminalId, event);
    });
    
    // Pause/resume events - immediate (affects trading state)
    bridge.on('paused', (event: ZmqEvent) => {
      this.emit('paused', terminalId, event);
    });
    
    bridge.on('resumed', (event: ZmqEvent) => {
      this.emit('resumed', terminalId, event);
    });
    
    // Error handling
    bridge.on('error', (error: Error) => {
      console.error(`[AgentChannelReader] ZMQ error for ${terminalId}:`, error.message);
      this.emit('error', terminalId, error);
    });
    
    bridge.on('status', (status: any) => {
      console.log(`[AgentChannelReader] ZMQ status for ${terminalId}:`, status.dataSocket, status.commandSocket);
      this.emit('status', terminalId, status);
    });
  }
  
  /**
   * Convert ZMQ event (from event-driven mode) to AgentSnapshot
   * Since ZmqPosition === AgentPosition (via shared Position type),
   * positions are passed through directly without field-by-field mapping.
   */
  private convertZmqEventToSnapshot(event: ZmqEvent): AgentSnapshot {
    const data = event.data as ZmqAccountData;
    return {
      timestamp: event.timestamp,
      platform: event.platform as 'MT5' | 'cTrader',
      accountId: event.accountId,
      broker: data.broker,
      server: data.server,
      balance: data.balance,
      equity: data.equity,
      margin: data.margin,
      freeMargin: data.freeMargin,
      marginLevel: data.marginLevel || 0,
      floatingPnL: data.floatingPnL,
      currency: data.currency,
      leverage: data.leverage,
      status: data.status,
      isLicenseValid: data.isLicenseValid,
      isPaused: data.isPaused,
      lastError: data.lastError,
      positions: data.positions, // Same type — no mapping needed
    };
  }
  
  /**
   * Register an MT5 terminal with ZMQ support (ZeroMQ only - no file fallback)
   * @deprecated Use connectMT5() instead
   */
  async registerMT5TerminalZmq(
    terminalId: string,
    options: {
      dataPort?: number;
      commandPort?: number;
      host?: string;
    } = {}
  ): Promise<boolean> {
    const dataPort = options.dataPort || DEFAULT_ZMQ_CONFIG.dataPort;
    const commandPort = options.commandPort || DEFAULT_ZMQ_CONFIG.commandPort;
    const host = options.host || '127.0.0.1';
    
    const config: TerminalConfig = {
      terminalId,
      platform: 'MT5',
      dataPath: undefined,
      dataPort,
      commandPort,
      host,
      mode: 'zmq',
    };
    
    this.terminalConfigs.set(terminalId, config);
    
    // ZMQ is required - no file fallback
    if (!this.zmqAvailable) {
      console.error('[AgentChannelReader] ZeroMQ not available');
      return false;
    }
    
    try {
      const bridge = createZmqBridgeForPorts(dataPort, commandPort, host);
      
      // Use the event-driven handlers
      this.setupEventDrivenHandlers(bridge, terminalId);
      
      // Try to start the bridge
      const started = await bridge.start();
      
      if (started) {
        this.zmqBridges.set(terminalId, bridge);
        console.log(`[AgentChannelReader] Registered MT5 terminal (ZeroMQ): ${terminalId}`);
        return true;
      }
    } catch (error) {
      console.warn(`[AgentChannelReader] Failed to start ZMQ bridge for ${terminalId}:`, error);
    }
    
    return false;
  }
  
  /**
   * Convert ZMQ snapshot to AgentSnapshot format
   * Positions pass through directly (same canonical type).
   */
  private convertZmqSnapshot(zmqSnapshot: ZmqSnapshot): AgentSnapshot {
    return {
      timestamp: zmqSnapshot.timestamp,
      platform: zmqSnapshot.platform,
      accountId: zmqSnapshot.accountId,
      broker: zmqSnapshot.broker,
      balance: zmqSnapshot.balance,
      equity: zmqSnapshot.equity,
      margin: zmqSnapshot.margin,
      freeMargin: zmqSnapshot.freeMargin,
      marginLevel: zmqSnapshot.marginLevel || 0,
      floatingPnL: zmqSnapshot.floatingPnL,
      currency: zmqSnapshot.currency,
      leverage: zmqSnapshot.leverage,
      status: zmqSnapshot.status,
      isLicenseValid: zmqSnapshot.isLicenseValid,
      isPaused: zmqSnapshot.isPaused,
      lastError: zmqSnapshot.lastError,
      positions: zmqSnapshot.positions, // Same type — no mapping needed
    };
  }
  
  /**
   * Unregister a terminal
   */
  async unregisterTerminal(terminalId: string): Promise<void> {
    // Stop ZMQ bridge if active (MT5)
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge) {
      await bridge.stop();
      this.zmqBridges.delete(terminalId);
    }
    
    // Stop Named Pipe client if active (cTrader)
    const pipeClient = this.pipeClients.get(terminalId);
    if (pipeClient) {
      await pipeClient.stop();
      this.pipeClients.delete(terminalId);
    }
    
    this.mt5DataPaths.delete(terminalId);
    this.terminalConfigs.delete(terminalId);
    this.lastSnapshots.delete(terminalId);
    this.stopPolling(terminalId);
  }
  
  /**
   * Get the communication mode for a terminal
   */
  getTerminalMode(terminalId: string): ChannelMode | null {
    const config = this.terminalConfigs.get(terminalId);
    return config?.mode || null;
  }
  
  /**
   * Get the platform type for a terminal
   */
  getTerminalPlatform(terminalId: string): Platform | null {
    const config = this.terminalConfigs.get(terminalId);
    return config?.platform || null;
  }
  
  /**
   * Get the full terminal config (ports, host, platform, mode).
   * Used by the EA control server to derive the control port.
   */
  getTerminalConfig(terminalId: string): TerminalConfig | null {
    return this.terminalConfigs.get(terminalId) || null;
  }

  /**
   * Check if terminal is using ZMQ mode (MT5)
   */
  isTerminalUsingZmq(terminalId: string): boolean {
    return this.zmqBridges.has(terminalId);
  }
  
  /**
   * Check if terminal is using Named Pipe mode (cTrader)
   */
  isTerminalUsingPipe(terminalId: string): boolean {
    return this.pipeClients.has(terminalId);
  }
  
  /**
   * Fetch trade history on demand for a specific terminal.
   * Returns the deals array from the bridge, or empty array on failure.
   */
  async fetchTradeHistory(terminalId: string, days: number = 3650): Promise<any[]> {
    // Try exact key first, then with mt5- prefix (callers may pass raw login)
    let bridge = this.zmqBridges.get(terminalId);
    if (!bridge && !terminalId.startsWith('mt5-') && !terminalId.startsWith('ctrader-')) {
      bridge = this.zmqBridges.get(`mt5-${terminalId}`) || this.zmqBridges.get(`ctrader-${terminalId}`);
      if (bridge) terminalId = `mt5-${terminalId}`;
    }
    if (!bridge || !bridge.isConnected()) {
      console.warn(`[AgentChannelReader] Cannot fetch history: terminal ${terminalId} not connected via ZMQ`);
      return [];
    }
    try {
      const result = await bridge.getHistory(days);
      const deals = result.deals;
      if (deals && deals.length > 0) {
        // Use the EA-reported accountId (login number) for the emit key so
        // that TradeHistoryContext can map it to the Supabase account ID via
        // loginMapRef.  Format: "mt5-{login}" to match existing convention.
        const emitId = result.accountId ? `mt5-${result.accountId}` : terminalId;
        console.log(`[AgentChannelReader] On-demand history fetch: ${deals.length} deals for ${terminalId} → emitting as ${emitId}`);
        // Emit the event so the renderer can process the deals
        this.emit('tradeHistory', emitId, deals);
        return deals;
      }
      console.log(`[AgentChannelReader] On-demand history fetch: 0 deals for ${terminalId}`);
      return [];
    } catch (err) {
      console.error(`[AgentChannelReader] On-demand history fetch failed for ${terminalId}:`, err);
      return [];
    }
  }

  /**
   * Check if terminal is connected AND actively receiving data (alive)
   * Uses heartbeat-based liveness, not just socket state.
   */
  isTerminalConnected(terminalId: string): boolean {
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge) {
      // For slave bridges, isAlive() now checks command-only connectivity
      // and lastMessageReceivedAt set by polling (markAlive).
      return bridge.isAlive();
    }
    
    const pipeClient = this.pipeClients.get(terminalId);
    if (pipeClient) return pipeClient.isConnected();
    
    return false;
  }
  
  /**
   * Start polling for updates
   */
  startPolling(terminalId: string, intervalMs: number = 1000): void {
    // Stop existing polling
    this.stopPolling(terminalId);
    
    const poll = async () => {
      const dataPath = this.mt5DataPaths.get(terminalId);
      if (!dataPath) return;
      
      const result = await readMT5Snapshot(dataPath);
      
      if (result.success && result.data) {
        const lastSnapshot = this.lastSnapshots.get(terminalId);
        
        // Only notify if data changed
        if (!lastSnapshot || result.data.timestamp !== lastSnapshot.timestamp) {
          this.lastSnapshots.set(terminalId, result.data);
          this.notifyListeners(terminalId, result.data);
        }
      }
    };
    
    // Initial poll
    poll();
    
    // Set up interval
    const interval = setInterval(poll, intervalMs);
    this.pollingIntervals.set(terminalId, interval);
  }
  
  /**
   * Stop polling for a terminal
   */
  stopPolling(terminalId: string): void {
    const interval = this.pollingIntervals.get(terminalId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(terminalId);
    }
  }
  
  /**
   * Stop all polling
   */
  stopAll(): void {
    for (const [terminalId] of this.pollingIntervals) {
      this.stopPolling(terminalId);
    }
  }
  
  /**
   * Subscribe to snapshot updates
   */
  subscribe(listener: (accountId: string, snapshot: AgentSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }
  
  /**
   * Notify listeners of snapshot update
   */
  private notifyListeners(accountId: string, snapshot: AgentSnapshot): void {
    for (const listener of this.snapshotListeners) {
      try {
        listener(accountId, snapshot);
      } catch (error) {
        console.error('[AgentChannelReader] Listener error:', error);
      }
    }
  }
  
  /**
   * Get the last known snapshot for a terminal
   */
  getLastSnapshot(terminalId: string): AgentSnapshot | undefined {
    return this.lastSnapshots.get(terminalId);
  }
  
  /**
   * Check if a terminal is a slave (command-only, no PUB socket).
   * Slave EAs copy trades autonomously — the app should only track P/L,
   * not attempt to duplicate the copy execution.
   */
  isSlaveTerminal(terminalId: string): boolean {
    const bridge = this.zmqBridges.get(terminalId) as any;
    return bridge?.config?.role === 'slave';
  }
  
  /**
   * Read snapshot immediately
   */
  async readSnapshot(terminalId: string): Promise<ChannelReaderResult> {
    const dataPath = this.mt5DataPaths.get(terminalId);
    if (!dataPath) {
      return { success: false, error: 'Terminal not registered' };
    }
    return readMT5Snapshot(dataPath);
  }
  
  /**
   * Send command to agent
   */
  async sendCommand(
    terminalId: string,
    command: AgentCommand
  ): Promise<{ success: boolean; response?: AgentResponse; error?: string }> {
    // Try ZMQ first if available
    const bridge = this.zmqBridges.get(terminalId);
    if (!bridge) {
      const knownKeys = [...this.zmqBridges.keys()].join(', ');
      console.warn(`[AgentChannelReader] sendCommand(${command.action}): no ZMQ bridge for "${terminalId}" (known bridges: ${knownKeys || 'none'})`);
    } else if (!bridge.isConnected()) {
      console.warn(`[AgentChannelReader] sendCommand(${command.action}): bridge for "${terminalId}" exists but not connected`);
    }
    if (bridge && bridge.isConnected()) {
      try {
        const zmqCommand: ZmqCommand = {
          action: command.action as ZmqCommand['action'],
          positionId: command.params?.positionId as string,
          params: command.params as Record<string, unknown>,
        };
        
        const response = await bridge.sendCommand(zmqCommand);
        
        return {
          success: response.success,
          response: {
            success: response.success,
            action: command.action,
            message: response.error || (response.success ? 'Command executed' : 'Command failed'),
            data: response,
            timestamp: new Date().toISOString(),
          },
          error: response.error,
        };
      } catch (error) {
        console.warn(`[AgentChannelReader] ZMQ command failed for ${terminalId}:`, error);
        // Fall through to file mode if available
      }
    }
    
    // Try Named Pipe client for cTrader
    const pipeClient = this.pipeClients.get(terminalId);
    if (pipeClient && pipeClient.isConnected()) {
      try {
        const pipeCommand: CTraderCommand = {
          action: command.action,
          positionId: command.params?.positionId as string,
          params: command.params as Record<string, unknown>,
        };
        
        const response = await pipeClient.sendCommand(pipeCommand);
        
        return {
          success: response.success,
          response: {
            success: response.success,
            action: command.action,
            message: response.error || response.message || (response.success ? 'Command executed' : 'Command failed'),
            data: response.data,
            timestamp: response.timestamp,
          },
          error: response.error,
        };
      } catch (error) {
        console.warn(`[AgentChannelReader] Named Pipe command failed for ${terminalId}:`, error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Named Pipe command failed',
        };
      }
    }
    
    // Fall back to file mode (MT5 only)
    const dataPath = this.mt5DataPaths.get(terminalId);
    if (!dataPath) {
      return { success: false, error: 'Terminal not registered or no fallback path' };
    }
    return sendMT5Command(dataPath, command);
  }
  
  /**
   * Send pause command
   */
  async pause(terminalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.sendCommand(terminalId, { action: 'PAUSE' });
    return { success: result.success, error: result.error };
  }
  
  /**
   * Send resume command
   */
  async resume(terminalId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.sendCommand(terminalId, { action: 'RESUME' });
    return { success: result.success, error: result.error };
  }
  
  /**
   * Send close all command
   */
  async closeAll(terminalId: string): Promise<{ success: boolean; closedCount?: number; error?: string }> {
    const result = await this.sendCommand(terminalId, { action: 'CLOSE_ALL' });
    return { 
      success: result.success, 
      closedCount: (result.response?.data as { closedCount?: number })?.closedCount,
      error: result.error,
    };
  }
  
  /**
   * Send close position command
   */
  async closePosition(terminalId: string, positionId: string): Promise<{ success: boolean; error?: string }> {
    const result = await this.sendCommand(terminalId, { 
      action: 'CLOSE_POSITION', 
      params: { positionId },
    });
    return { success: result.success, error: result.error };
  }
  
  /**
   * Open a new position on a terminal (Trade Copier support)
   */
  async openPosition(terminalId: string, params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    volume: number;
    sl?: number;
    tp?: number;
    magic?: number;
    comment?: string;
    deviation?: number;
  }): Promise<{ success: boolean; ticket?: string; error?: string; data?: unknown }> {
    // Prefer ZMQ direct method for rich parameter support
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge && bridge.isConnected()) {
      try {
        const response = await bridge.openPosition(params);
        return {
          success: response.success,
          ticket: response.ticket != null ? String(response.ticket) : undefined,
          error: response.error,
          data: response,
        };
      } catch (error) {
        console.warn(`[AgentChannelReader] ZMQ openPosition failed for ${terminalId}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'ZMQ openPosition failed',
        };
      }
    }
    
    return { success: false, error: 'Terminal not connected via ZMQ' };
  }
  
  /**
   * Modify position SL/TP on a terminal (Trade Copier support)
   */
  async modifyPosition(terminalId: string, ticket: string, sl?: number, tp?: number): Promise<{ success: boolean; error?: string }> {
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge && bridge.isConnected()) {
      try {
        const response = await bridge.modifyPosition(ticket, sl, tp);
        return { success: response.success, error: response.error };
      } catch (error) {
        console.warn(`[AgentChannelReader] ZMQ modifyPosition failed for ${terminalId}:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'ZMQ modifyPosition failed',
        };
      }
    }
    
    return { success: false, error: 'Terminal not connected via ZMQ' };
  }
  
  /**
   * Ping the agent to check connectivity
   */
  async ping(terminalId: string): Promise<boolean> {
    // Try ZMQ bridge (MT5)
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge && bridge.isConnected()) {
      return bridge.ping();
    }
    
    // Try Named Pipe client (cTrader)
    const pipeClient = this.pipeClients.get(terminalId);
    if (pipeClient && pipeClient.isConnected()) {
      return pipeClient.ping();
    }
    
    // For file mode (MT5), check if data file was recently updated
    const dataPath = this.mt5DataPaths.get(terminalId);
    if (dataPath) {
      try {
        const stats = await fs.stat(getMT5DataFilePath(dataPath));
        const ageMs = Date.now() - stats.mtime.getTime();
        return ageMs < 10000; // Consider alive if updated in last 10 seconds
      } catch {
        return false;
      }
    }
    
    return false;
  }
  
  /**
   * Get connection statistics
   */
  getStats(terminalId: string): { mode: ChannelMode; platform: Platform; eventsReceived: number; commandsSent: number; connected: boolean } | null {
    const config = this.terminalConfigs.get(terminalId);
    if (!config) return null;
    
    // ZMQ bridge (MT5)
    const bridge = this.zmqBridges.get(terminalId);
    if (bridge) {
      const status = bridge.getStatus();
      return {
        mode: 'zmq',
        platform: 'MT5',
        eventsReceived: status.eventsReceived,
        commandsSent: status.commandsSent,
        connected: bridge.isConnected(),
      };
    }
    
    // Named Pipe client (cTrader)
    const pipeClient = this.pipeClients.get(terminalId);
    if (pipeClient) {
      const status = pipeClient.getStatus();
      return {
        mode: 'pipe',
        platform: 'cTrader',
        eventsReceived: status.messagesReceived,
        commandsSent: status.commandsSent,
        connected: pipeClient.isConnected(),
      };
    }
    
    return {
      mode: 'file',
      platform: config.platform || 'MT5',
      eventsReceived: 0, // Not tracked in file mode
      commandsSent: 0,
      connected: false,
    };
  }
  
  /**
   * Get all registered terminal IDs
   */
  getRegisteredTerminals(): string[] {
    return Array.from(this.terminalConfigs.keys());
  }
  
  /**
   * Get all cTrader terminal IDs
   */
  getCTraderTerminals(): string[] {
    return Array.from(this.terminalConfigs.entries())
      .filter(([, config]) => config.platform === 'cTrader')
      .map(([id]) => id);
  }
  
  /**
   * Get all MT5 terminal IDs
   */
  getMT5Terminals(): string[] {
    return Array.from(this.terminalConfigs.entries())
      .filter(([, config]) => config.platform === 'MT5')
      .map(([id]) => id);
  }
  
  /**
   * Stop all connections and cleanup.
   * Releases all port allocations via PortManager.
   */
  async shutdown(): Promise<void> {
    // Stop all ZMQ bridges (MT5) and release their ports
    for (const [terminalId, bridge] of this.zmqBridges) {
      try {
        await bridge.stop();
      } catch (error) {
        console.error(`[AgentChannelReader] Error stopping ZMQ bridge for ${terminalId}:`, error);
      }
      portManager.releaseByLabel(terminalId);
    }
    this.zmqBridges.clear();
    
    // Stop all Named Pipe clients (cTrader)
    for (const [terminalId, client] of this.pipeClients) {
      try {
        await client.stop();
      } catch (error) {
        console.error(`[AgentChannelReader] Error stopping Named Pipe client for ${terminalId}:`, error);
      }
    }
    this.pipeClients.clear();
    
    // Stop all polling
    this.stopAll();
    
    // Clear state
    this.mt5DataPaths.clear();
    this.terminalConfigs.clear();
    this.lastSnapshots.clear();
    this.snapshotListeners.clear();
    
    console.log('[AgentChannelReader] Shutdown complete');
  }
}

// Singleton instance
export const agentChannelReader = new AgentChannelReader();

// Re-export ZMQ types for convenience
export type { ZmqSnapshot, ZmqCommand, ZmqResponse } from './zmq-bridge.js';
export { ZmqBridge, createZmqBridge, createZmqBridgeForPorts, isZmqAvailable } from './zmq-bridge.js';

// Re-export Named Pipe types for convenience
export type { CTraderSnapshot, CTraderCommand, CTraderResponse } from './named-pipe-client.js';
export { NamedPipeClient, createNamedPipeClient, createNamedPipeClientForInstance, isCTraderPipeAvailable } from './named-pipe-client.js';
