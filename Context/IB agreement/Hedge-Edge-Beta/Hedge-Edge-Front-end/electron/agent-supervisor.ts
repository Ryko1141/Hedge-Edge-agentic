/**
 * Agent Supervisor Module
 * =======================
 * Manages the lifecycle of bundled trading agents:
 * - Auto-start on app launch
 * - Health monitoring with retries
 * - Clean shutdown on app quit
 * - Output logging for support/debugging
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { 
  AgentPlatform, 
  getAgentConfig, 
  bundledAgentExists,
  getAgentPort,
} from './agent-config.js';

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = 
  | 'stopped'
  | 'starting'
  | 'running'
  | 'connected'
  | 'error'
  | 'not-available';

export interface SupervisedAgent {
  platform: AgentPlatform;
  status: AgentStatus;
  process: ChildProcess | null;
  pid: number | null;
  port: number;
  startTime: Date | null;
  lastHealthCheck: Date | null;
  healthCheckOk: boolean;
  restartCount: number;
  errorMessage: string | null;
  logStream: fs.WriteStream | null;
}

export interface AgentHealthStatus {
  platform: AgentPlatform;
  status: AgentStatus;
  port: number;
  pid: number | null;
  uptime: number | null; // seconds
  restartCount: number;
  lastError: string | null;
  isBundled: boolean;
  isExternal: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const SUPERVISOR_CONFIG = {
  /** Time to wait for agent to start before health check (ms) */
  startupDelay: 2000,
  /** Interval between health checks (ms) */
  healthCheckInterval: 10000,
  /** Timeout for health check requests (ms) */
  healthCheckTimeout: 5000,
  /** Max restart attempts before giving up */
  maxRestarts: 3,
  /** Delay between restart attempts (ms) */
  restartDelay: 3000,
  /** Time to wait for graceful shutdown (ms) */
  shutdownTimeout: 5000,
};

// ============================================================================
// State
// ============================================================================

const supervisedAgents: Map<AgentPlatform, SupervisedAgent> = new Map();
let healthCheckIntervalId: NodeJS.Timeout | null = null;
let isShuttingDown = false;

// ============================================================================
// Logging
// ============================================================================

/**
 * Create or get log stream for agent output
 */
function getLogStream(platform: AgentPlatform, logPath: string): fs.WriteStream {
  // Ensure log directory exists
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Rotate log if too large (> 10MB)
  try {
    const stats = fs.statSync(logPath);
    if (stats.size > 10 * 1024 * 1024) {
      const rotatedPath = `${logPath}.${Date.now()}.old`;
      fs.renameSync(logPath, rotatedPath);
    }
  } catch {
    // File doesn't exist yet, that's fine
  }
  
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  stream.write(`\n${'='.repeat(60)}\n`);
  stream.write(`Agent started: ${new Date().toISOString()}\n`);
  stream.write(`${'='.repeat(60)}\n\n`);
  
  return stream;
}

/**
 * Log to main process console with timestamp
 */
function supervisorLog(level: 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  const prefix = `[AgentSupervisor ${timestamp}]`;
  
  switch (level) {
    case 'error':
      console.error(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    default:
      console.log(prefix, message, ...args);
  }
}

// ============================================================================
// Port & Health Checking
// ============================================================================

/**
 * Check if a port is in use (agent might be running)
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Perform health check against agent HTTP endpoint
 * @param host - The host to check (defaults to 127.0.0.1 for bundled agents)
 * @param port - The port to check
 */
async function performHealthCheck(host: string, port: number): Promise<{ ok: boolean; connected?: boolean; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPERVISOR_CONFIG.healthCheckTimeout);
  
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json() as any;
    return { 
      ok: true, 
      connected: data.mt5_connected || data.ctrader_connected || data.connected || false,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: message };
  }
}

// ============================================================================
// Agent Lifecycle
// ============================================================================

/**
 * Initialize state for an agent
 */
function initAgentState(platform: AgentPlatform): SupervisedAgent {
  const port = getAgentPort(platform);
  
  return {
    platform,
    status: 'stopped',
    process: null,
    pid: null,
    port,
    startTime: null,
    lastHealthCheck: null,
    healthCheckOk: false,
    restartCount: 0,
    errorMessage: null,
    logStream: null,
  };
}

/**
 * Start a bundled agent process
 */
async function startAgent(platform: AgentPlatform): Promise<boolean> {
  const config = getAgentConfig();
  const platformConfig = config[platform];
  
  // Only start if mode is bundled
  if (platformConfig.mode !== 'bundled') {
    supervisorLog('info', `Agent ${platform}: mode is ${platformConfig.mode}, not starting`);
    return false;
  }
  
  // Check if bundled agent exists
  if (!bundledAgentExists(platform)) {
    supervisorLog('warn', `Agent ${platform}: bundled executable not found at ${platformConfig.paths.executable}`);
    
    let agent = supervisedAgents.get(platform);
    if (!agent) {
      agent = initAgentState(platform);
      supervisedAgents.set(platform, agent);
    }
    agent.status = 'not-available';
    agent.errorMessage = 'Bundled agent not found';
    return false;
  }
  
  let agent = supervisedAgents.get(platform);
  if (!agent) {
    agent = initAgentState(platform);
    supervisedAgents.set(platform, agent);
  }
  
  // Check if already running
  if (agent.process && agent.status === 'running') {
    supervisorLog('info', `Agent ${platform}: already running`);
    return true;
  }
  
  // Check restart limit
  if (agent.restartCount >= SUPERVISOR_CONFIG.maxRestarts) {
    supervisorLog('error', `Agent ${platform}: max restarts exceeded (${agent.restartCount})`);
    agent.status = 'error';
    agent.errorMessage = `Max restart attempts (${SUPERVISOR_CONFIG.maxRestarts}) exceeded`;
    return false;
  }
  
  supervisorLog('info', `Agent ${platform}: starting from ${platformConfig.paths.executable}`);
  agent.status = 'starting';
  
  try {
    // Create log stream
    agent.logStream = getLogStream(platform, platformConfig.paths.logFile);
    
    // Minimal env — don't leak secrets to child agent processes (FIX-07)
    const childEnv: Record<string, string> = {
      PATH: process.env.PATH || '',
      SYSTEMROOT: process.env.SYSTEMROOT || '',
      TEMP: process.env.TEMP || '',
      TMP: process.env.TMP || '',
      HOME: process.env.HOME || process.env.USERPROFILE || '',
      USERPROFILE: process.env.USERPROFILE || '',
      PORT: String(platformConfig.endpoint.port),
      HOST: platformConfig.endpoint.host,
      NODE_ENV: process.env.NODE_ENV || 'production',
    };

    const proc = spawn(platformConfig.paths.executable, [], {
      cwd: platformConfig.paths.workingDir,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    
    agent.process = proc;
    agent.pid = proc.pid || null;
    agent.startTime = new Date();
    
    // Pipe stdout/stderr to log file
    proc.stdout?.on('data', (data) => {
      agent!.logStream?.write(`[stdout] ${data}`);
    });
    
    proc.stderr?.on('data', (data) => {
      agent!.logStream?.write(`[stderr] ${data}`);
    });
    
    // Handle process exit
    proc.on('exit', (code, signal) => {
      supervisorLog('info', `Agent ${platform}: exited with code=${code} signal=${signal}`);
      agent!.logStream?.write(`\nProcess exited: code=${code} signal=${signal}\n`);
      agent!.logStream?.end();
      agent!.logStream = null;
      agent!.process = null;
      agent!.pid = null;
      
      if (!isShuttingDown && code !== 0) {
        agent!.status = 'error';
        agent!.errorMessage = `Process exited unexpectedly (code: ${code})`;
        agent!.restartCount++;
        
        // Attempt restart after delay
        if (agent!.restartCount < SUPERVISOR_CONFIG.maxRestarts) {
          supervisorLog('info', `Agent ${platform}: scheduling restart (attempt ${agent!.restartCount + 1})`);
          setTimeout(() => startAgent(platform), SUPERVISOR_CONFIG.restartDelay);
        }
      } else {
        agent!.status = 'stopped';
      }
    });
    
    proc.on('error', (error) => {
      supervisorLog('error', `Agent ${platform}: spawn error:`, error);
      agent!.logStream?.write(`\nSpawn error: ${error.message}\n`);
      agent!.status = 'error';
      agent!.errorMessage = error.message;
    });
    
    // Wait for startup then check health
    await new Promise((resolve) => setTimeout(resolve, SUPERVISOR_CONFIG.startupDelay));
    
    const health = await performHealthCheck(platformConfig.endpoint.host, platformConfig.endpoint.port);
    if (health.ok) {
      agent.status = health.connected ? 'connected' : 'running';
      agent.healthCheckOk = true;
      agent.lastHealthCheck = new Date();
      // Reset restart counter on successful health check
      agent.restartCount = 0;
      supervisorLog('info', `Agent ${platform}: started successfully (connected: ${health.connected})`);
      return true;
    } else {
      // Agent started but health check failed - might still be initializing
      agent.status = 'running';
      supervisorLog('warn', `Agent ${platform}: started but health check failed: ${health.error}`);
      return true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    supervisorLog('error', `Agent ${platform}: failed to start:`, message);
    agent.status = 'error';
    agent.errorMessage = message;
    return false;
  }
}

/**
 * Stop an agent process
 */
async function stopAgent(platform: AgentPlatform): Promise<void> {
  const agent = supervisedAgents.get(platform);
  if (!agent || !agent.process) {
    return;
  }
  
  supervisorLog('info', `Agent ${platform}: stopping...`);
  
  return new Promise((resolve) => {
    const proc = agent.process!;
    let killed = false;
    
    // Timeout for graceful shutdown
    const timeoutId = setTimeout(() => {
      if (!killed) {
        supervisorLog('warn', `Agent ${platform}: force killing after timeout`);
        proc.kill('SIGKILL');
      }
    }, SUPERVISOR_CONFIG.shutdownTimeout);
    
    proc.once('exit', () => {
      killed = true;
      clearTimeout(timeoutId);
      agent.status = 'stopped';
      agent.process = null;
      agent.pid = null;
      supervisorLog('info', `Agent ${platform}: stopped`);
      resolve();
    });
    
    // Try graceful shutdown first
    if (process.platform === 'win32') {
      proc.kill(); // SIGTERM not supported on Windows
    } else {
      proc.kill('SIGTERM');
    }
  });
}

// ============================================================================
// Health Monitoring
// ============================================================================

/**
 * Run health checks on all supervised agents
 */
async function runHealthChecks(): Promise<void> {
  if (isShuttingDown) return;
  
  const config = getAgentConfig();
  
  for (const [platform, agent] of supervisedAgents) {
    const platformConfig = config[platform];
    
    // Skip if not in bundled mode or not started
    if (platformConfig.mode !== 'bundled' || agent.status === 'stopped' || agent.status === 'not-available') {
      continue;
    }
    
    try {
      const health = await performHealthCheck(platformConfig.endpoint.host, platformConfig.endpoint.port);
      agent.lastHealthCheck = new Date();
      agent.healthCheckOk = health.ok;
      
      if (health.ok) {
        agent.status = health.connected ? 'connected' : 'running';
        agent.errorMessage = null;
        // Reset restart counter on successful health check
        if (agent.restartCount > 0) {
          supervisorLog('info', `Agent ${platform}: health check succeeded, resetting restart counter from ${agent.restartCount}`);
          agent.restartCount = 0;
        }
      } else {
        // Check if process died
        if (!agent.process || agent.process.exitCode !== null) {
          agent.status = 'error';
          agent.errorMessage = 'Agent process terminated';
        }
      }
    } catch (error) {
      agent.healthCheckOk = false;
      agent.errorMessage = error instanceof Error ? error.message : 'Health check failed';
    }
  }
}

/**
 * Start the health check interval
 */
function startHealthMonitoring(): void {
  if (healthCheckIntervalId) return;
  
  healthCheckIntervalId = setInterval(runHealthChecks, SUPERVISOR_CONFIG.healthCheckInterval);
  supervisorLog('info', 'Health monitoring started');
}

/**
 * Stop the health check interval
 */
function stopHealthMonitoring(): void {
  if (healthCheckIntervalId) {
    clearInterval(healthCheckIntervalId);
    healthCheckIntervalId = null;
    supervisorLog('info', 'Health monitoring stopped');
  }
}

// ============================================================================
// External Agent Detection
// ============================================================================

/**
 * Check if an external agent is available
 */
async function checkExternalAgent(platform: AgentPlatform): Promise<AgentHealthStatus> {
  const config = getAgentConfig();
  const platformConfig = config[platform];
  
  const baseStatus: AgentHealthStatus = {
    platform,
    status: 'stopped',
    port: platformConfig.endpoint.port,
    pid: null,
    uptime: null,
    restartCount: 0,
    lastError: null,
    isBundled: false,
    isExternal: true,
  };
  
  // For external agents, skip local port check (it won't work for remote hosts)
  // Instead, go directly to health check which uses the configured host
  const isLocalAgent = platformConfig.endpoint.host === '127.0.0.1' || platformConfig.endpoint.host === 'localhost';
  
  if (isLocalAgent) {
    // Check if port is in use (only works for local agents)
    const portInUse = await isPortInUse(platformConfig.endpoint.port);
    if (!portInUse) {
      baseStatus.status = 'stopped';
      baseStatus.lastError = 'No agent detected on configured port';
      return baseStatus;
    }
  }
  
  // Perform health check using configured host
  const health = await performHealthCheck(platformConfig.endpoint.host, platformConfig.endpoint.port);
  if (health.ok) {
    baseStatus.status = health.connected ? 'connected' : 'running';
  } else {
    baseStatus.status = 'error';
    baseStatus.lastError = health.error || 'Health check failed';
  }
  
  return baseStatus;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the supervisor and start bundled agents
 */
export async function initializeSupervisor(): Promise<void> {
  supervisorLog('info', 'Initializing agent supervisor...');
  
  const config = getAgentConfig();
  
  // Initialize state for each platform
  for (const platform of ['mt5', 'ctrader'] as AgentPlatform[]) {
    supervisedAgents.set(platform, initAgentState(platform));
    
    // Auto-start bundled agents
    if (config[platform].mode === 'bundled') {
      await startAgent(platform);
    }
  }
  
  // Start health monitoring
  startHealthMonitoring();
  
  supervisorLog('info', 'Agent supervisor initialized');
}

/**
 * Shutdown all supervised agents
 */
export async function shutdownSupervisor(): Promise<void> {
  supervisorLog('info', 'Shutting down agent supervisor...');
  isShuttingDown = true;
  
  // Stop health monitoring
  stopHealthMonitoring();
  
  // Stop all agents
  const stopPromises: Promise<void>[] = [];
  for (const [platform] of supervisedAgents) {
    stopPromises.push(stopAgent(platform));
  }
  
  await Promise.all(stopPromises);
  supervisedAgents.clear();
  
  supervisorLog('info', 'Agent supervisor shutdown complete');
}

/**
 * Get the health status of an agent
 */
export async function getAgentHealthStatus(platform: AgentPlatform): Promise<AgentHealthStatus> {
  const config = getAgentConfig();
  const platformConfig = config[platform];
  
  // External mode - just check the endpoint
  if (platformConfig.mode === 'external') {
    return checkExternalAgent(platform);
  }
  
  // Not configured
  if (platformConfig.mode === 'not-configured') {
    return {
      platform,
      status: 'not-available',
      port: platformConfig.endpoint.port,
      pid: null,
      uptime: null,
      restartCount: 0,
      lastError: 'No agent configured. Install bundled agent or configure external.',
      isBundled: false,
      isExternal: false,
    };
  }
  
  // Bundled mode - check supervised agent
  const agent = supervisedAgents.get(platform);
  if (!agent) {
    return {
      platform,
      status: 'stopped',
      port: platformConfig.endpoint.port,
      pid: null,
      uptime: null,
      restartCount: 0,
      lastError: 'Supervisor not initialized',
      isBundled: true,
      isExternal: false,
    };
  }
  
  const uptime = agent.startTime 
    ? Math.floor((Date.now() - agent.startTime.getTime()) / 1000) 
    : null;
  
  return {
    platform,
    status: agent.status,
    port: agent.port,
    pid: agent.pid,
    uptime,
    restartCount: agent.restartCount,
    lastError: agent.errorMessage,
    isBundled: true,
    isExternal: false,
  };
}

/**
 * Get health status of all agents
 */
export async function getAllAgentHealthStatus(): Promise<{
  mt5: AgentHealthStatus;
  ctrader: AgentHealthStatus;
}> {
  const [mt5, ctrader] = await Promise.all([
    getAgentHealthStatus('mt5'),
    getAgentHealthStatus('ctrader'),
  ]);
  
  return { mt5, ctrader };
}

/**
 * Manually start an agent (if bundled mode)
 */
export async function manualStartAgent(platform: AgentPlatform): Promise<{ success: boolean; error?: string }> {
  try {
    const started = await startAgent(platform);
    if (started) {
      return { success: true };
    }
    
    const agent = supervisedAgents.get(platform);
    return { 
      success: false, 
      error: agent?.errorMessage || 'Failed to start agent',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Manually stop an agent
 */
export async function manualStopAgent(platform: AgentPlatform): Promise<{ success: boolean; error?: string }> {
  try {
    await stopAgent(platform);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Restart an agent
 */
export async function restartAgent(platform: AgentPlatform): Promise<{ success: boolean; error?: string }> {
  const agent = supervisedAgents.get(platform);
  if (agent) {
    agent.restartCount = 0; // Reset restart count for manual restart
  }
  
  await stopAgent(platform);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return manualStartAgent(platform);
}

/**
 * Get the log file path for an agent
 */
export function getAgentLogPath(platform: AgentPlatform): string {
  const config = getAgentConfig();
  return config[platform].paths.logFile;
}
