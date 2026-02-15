/**
 * Agent Configuration Module
 * ==========================
 * Manages configuration for trading terminal agents (MT5/cTrader).
 * Supports bundled agents (auto-started) and external agents (user-configured).
 *
 * Configuration priority:
 * 1. User overrides (persisted in electron-store)
 * 2. Environment variables
 * 3. Default bundled paths/ports
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export type AgentPlatform = 'mt5' | 'ctrader';

export type AgentMode = 'bundled' | 'external' | 'not-configured';

export interface AgentEndpoint {
  host: string;
  port: number;
}

export interface AgentPaths {
  /** Path to the bundled agent executable */
  executable: string;
  /** Path to agent log file */
  logFile: string;
  /** Working directory for agent */
  workingDir: string;
}

export interface PlatformAgentConfig {
  mode: AgentMode;
  /** For bundled mode */
  paths: AgentPaths;
  /** For external mode or bundled endpoint */
  endpoint: AgentEndpoint;
  /** Whether user has overridden the default config */
  isUserOverride: boolean;
}

export interface AgentConfig {
  mt5: PlatformAgentConfig;
  ctrader: PlatformAgentConfig;
}

export interface UserAgentOverrides {
  mt5?: {
    mode?: AgentMode;
    host?: string;
    port?: number;
  };
  ctrader?: {
    mode?: AgentMode;
    host?: string;
    port?: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Default ports for agents - keep these configurable, never hardcoded in other modules */
export const DEFAULT_AGENT_PORTS = {
  mt5: 5101,
  ctrader: 5102,
} as const;

/** Environment variable names for configuration */
export const ENV_VARS = {
  MT5_AGENT_HOST: 'HEDGEEDGE_MT5_AGENT_HOST',
  MT5_AGENT_PORT: 'HEDGEEDGE_MT5_AGENT_PORT',
  MT5_AGENT_PATH: 'HEDGEEDGE_MT5_AGENT_PATH',
  CTRADER_AGENT_HOST: 'HEDGEEDGE_CTRADER_AGENT_HOST',
  CTRADER_AGENT_PORT: 'HEDGEEDGE_CTRADER_AGENT_PORT',
  CTRADER_AGENT_PATH: 'HEDGEEDGE_CTRADER_AGENT_PATH',
  AGENT_MODE: 'HEDGEEDGE_AGENT_MODE', // 'bundled' | 'external'
} as const;

/** Agent executable names per platform */
const AGENT_EXECUTABLES = {
  win32: {
    mt5: 'mt5-agent.exe',
    ctrader: 'ctrader-agent.exe',
  },
  darwin: {
    mt5: 'mt5-agent',
    ctrader: 'ctrader-agent',
  },
  linux: {
    mt5: 'mt5-agent',
    ctrader: 'ctrader-agent',
  },
} as const;

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Get the base directory for bundled agents
 * In development: project root / agents
 * In production: app.getPath('exe') parent / agents (or resources/agents on macOS)
 */
function getAgentsBaseDir(): string {
  if (app.isPackaged) {
    // Production: agents bundled with the app
    if (process.platform === 'darwin') {
      // macOS: Contents/Resources/agents
      return path.join(app.getAppPath(), '..', 'agents');
    } else {
      // Windows/Linux: alongside the executable
      return path.join(path.dirname(app.getPath('exe')), 'agents');
    }
  } else {
    // Development: agents folder in project root
    return path.join(app.getAppPath(), 'agents');
  }
}

/**
 * Get the logs directory for agent output
 */
function getAgentLogsDir(): string {
  const logsDir = path.join(app.getPath('userData'), 'logs', 'agents');
  
  // Ensure directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  return logsDir;
}

/**
 * Get the path to a bundled agent executable
 */
function getBundledAgentPath(platform: AgentPlatform): string {
  const os = process.platform as 'win32' | 'darwin' | 'linux';
  const exeName = AGENT_EXECUTABLES[os]?.[platform] || AGENT_EXECUTABLES.linux[platform];
  return path.join(getAgentsBaseDir(), platform, exeName);
}

/**
 * Check if bundled agent exists at expected path
 */
export function bundledAgentExists(platform: AgentPlatform): boolean {
  const agentPath = getBundledAgentPath(platform);
  return fs.existsSync(agentPath);
}

// ============================================================================
// User Settings Persistence
// ============================================================================

// Simple file-based storage for user overrides (no electron-store dependency)
const CONFIG_FILE = 'agent-config.json';

function getConfigFilePath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

/**
 * Load user overrides from disk
 */
export function loadUserOverrides(): UserAgentOverrides {
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as UserAgentOverrides;
    }
  } catch (error) {
    console.error('Failed to load agent config:', error);
  }
  return {};
}

/**
 * Save user overrides to disk
 */
export function saveUserOverrides(overrides: UserAgentOverrides): void {
  try {
    const configPath = getConfigFilePath();
    fs.writeFileSync(configPath, JSON.stringify(overrides, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save agent config:', error);
    throw error;
  }
}

/**
 * Clear user overrides and return to defaults
 */
export function clearUserOverrides(): void {
  try {
    const configPath = getConfigFilePath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  } catch (error) {
    console.error('Failed to clear agent config:', error);
  }
}

// ============================================================================
// Configuration Resolution
// ============================================================================

/**
 * Resolve configuration for a specific platform agent
 * Priority: User Override > Env Var > Bundled Default
 */
function resolvePlatformConfig(
  platform: AgentPlatform,
  userOverrides: UserAgentOverrides
): PlatformAgentConfig {
  const override = userOverrides[platform];
  const defaultPort = DEFAULT_AGENT_PORTS[platform];
  
  // Check environment variables
  const envHost = process.env[platform === 'mt5' ? ENV_VARS.MT5_AGENT_HOST : ENV_VARS.CTRADER_AGENT_HOST];
  const envPort = process.env[platform === 'mt5' ? ENV_VARS.MT5_AGENT_PORT : ENV_VARS.CTRADER_AGENT_PORT];
  const envPath = process.env[platform === 'mt5' ? ENV_VARS.MT5_AGENT_PATH : ENV_VARS.CTRADER_AGENT_PATH];
  const globalMode = process.env[ENV_VARS.AGENT_MODE] as AgentMode | undefined;
  
  // Determine paths
  const bundledPath = envPath || getBundledAgentPath(platform);
  const logsDir = getAgentLogsDir();
  
  const paths: AgentPaths = {
    executable: bundledPath,
    logFile: path.join(logsDir, `${platform}-agent.log`),
    workingDir: path.dirname(bundledPath),
  };
  
  // Determine endpoint
  const endpoint: AgentEndpoint = {
    host: override?.host || envHost || '127.0.0.1',
    port: override?.port || (envPort ? parseInt(envPort, 10) : defaultPort),
  };
  
  // Determine mode
  let mode: AgentMode;
  const isUserOverride = !!override;
  
  if (override?.mode) {
    // User explicitly set mode
    mode = override.mode;
  } else if (globalMode) {
    // Environment variable set
    mode = globalMode;
  } else if (bundledAgentExists(platform)) {
    // Bundled agent exists
    mode = 'bundled';
  } else if (envHost) {
    // External host configured via env
    mode = 'external';
  } else {
    // No bundled agent, no external config
    mode = 'not-configured';
  }
  
  return {
    mode,
    paths,
    endpoint,
    isUserOverride,
  };
}

/**
 * Get full agent configuration
 */
export function getAgentConfig(): AgentConfig {
  const userOverrides = loadUserOverrides();
  
  return {
    mt5: resolvePlatformConfig('mt5', userOverrides),
    ctrader: resolvePlatformConfig('ctrader', userOverrides),
  };
}

/**
 * Get the URL for agent requests
 */
export function getAgentUrl(platform: AgentPlatform): string {
  const config = getAgentConfig();
  const platformConfig = config[platform];
  return `http://${platformConfig.endpoint.host}:${platformConfig.endpoint.port}`;
}

/**
 * Get the port for a platform agent
 */
export function getAgentPort(platform: AgentPlatform): number {
  const config = getAgentConfig();
  return config[platform].endpoint.port;
}

/**
 * Update user configuration for a platform
 */
export function setAgentConfig(
  platform: AgentPlatform,
  config: { mode?: AgentMode; host?: string; port?: number }
): void {
  const overrides = loadUserOverrides();
  overrides[platform] = {
    ...overrides[platform],
    ...config,
  };
  saveUserOverrides(overrides);
}

/**
 * Reset a platform's configuration to defaults
 */
export function resetAgentConfig(platform: AgentPlatform): void {
  const overrides = loadUserOverrides();
  delete overrides[platform];
  saveUserOverrides(overrides);
}

/**
 * Get human-readable status summary
 */
export function getConfigSummary(): {
  mt5: { mode: AgentMode; endpoint: string; hasBundled: boolean };
  ctrader: { mode: AgentMode; endpoint: string; hasBundled: boolean };
} {
  const config = getAgentConfig();
  
  return {
    mt5: {
      mode: config.mt5.mode,
      endpoint: `${config.mt5.endpoint.host}:${config.mt5.endpoint.port}`,
      hasBundled: bundledAgentExists('mt5'),
    },
    ctrader: {
      mode: config.ctrader.mode,
      endpoint: `${config.ctrader.endpoint.host}:${config.ctrader.endpoint.port}`,
      hasBundled: bundledAgentExists('ctrader'),
    },
  };
}
