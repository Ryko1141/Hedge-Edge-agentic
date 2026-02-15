/**
 * MT5 WebRequest Whitelist Helper
 * 
 * Helps manage the MT5 terminal WebRequest URL whitelist.
 * MT5 requires explicit whitelisting of URLs before WebRequest can be used.
 * 
 * The whitelist is stored in the terminal's configuration file:
 * - Path: <DataFolder>/config/common.ini
 * - Section: [Common]
 * - Key: WebRequest=url1|url2|url3...
 */

import { promises as fs } from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface WebRequestWhitelistStatus {
  /** Whether the check was successful */
  success: boolean;
  /** Whether the URL is already whitelisted */
  isWhitelisted: boolean;
  /** Current whitelist entries */
  currentWhitelist: string[];
  /** Error message if check failed */
  error?: string;
  /** Path to the config file */
  configPath?: string;
}

export interface WebRequestWhitelistResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether the terminal needs to be restarted */
  restartRequired?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

export const HEDGE_EDGE_API_URL = 'https://api.hedge-edge.com';
export const HEDGE_EDGE_WEBREQUEST_URLS = [
  'https://api.hedge-edge.com',
  'https://hedge-edge.com',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse MT5 INI file format
 */
function parseIniFile(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let currentSection = '';
  
  const lines = content.split(/\r?\n/);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }
    
    // Section header
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!result[currentSection]) {
        result[currentSection] = {};
      }
      continue;
    }
    
    // Key=Value pair
    const keyValueMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (keyValueMatch && currentSection) {
      const key = keyValueMatch[1].trim();
      const value = keyValueMatch[2].trim();
      result[currentSection][key] = value;
    }
  }
  
  return result;
}

/**
 * Serialize INI file content
 */
function serializeIniFile(data: Record<string, Record<string, string>>): string {
  const lines: string[] = [];
  
  for (const [section, values] of Object.entries(data)) {
    lines.push(`[${section}]`);
    for (const [key, value] of Object.entries(values)) {
      lines.push(`${key}=${value}`);
    }
    lines.push('');
  }
  
  return lines.join('\r\n');
}

/**
 * Get the config file path for an MT5 terminal
 */
function getConfigPath(dataPath: string): string {
  return path.join(dataPath, 'config', 'common.ini');
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Check if a URL is in the MT5 WebRequest whitelist
 */
export async function checkWebRequestWhitelist(
  dataPath: string,
  url: string = HEDGE_EDGE_API_URL
): Promise<WebRequestWhitelistStatus> {
  const configPath = getConfigPath(dataPath);
  
  try {
    // Check if config file exists
    try {
      await fs.access(configPath);
    } catch {
      return {
        success: true,
        isWhitelisted: false,
        currentWhitelist: [],
        configPath,
      };
    }
    
    // Read and parse the config file
    const content = await fs.readFile(configPath, 'utf-16le');
    const config = parseIniFile(content);
    
    // Get current whitelist
    const webRequestValue = config['Common']?.['WebRequest'] || '';
    const currentWhitelist = webRequestValue
      .split('|')
      .map(u => u.trim())
      .filter(u => u.length > 0);
    
    // Check if URL is whitelisted
    const isWhitelisted = currentWhitelist.some(
      whitelistedUrl => url.startsWith(whitelistedUrl) || whitelistedUrl.startsWith(url)
    );
    
    return {
      success: true,
      isWhitelisted,
      currentWhitelist,
      configPath,
    };
  } catch (error) {
    return {
      success: false,
      isWhitelisted: false,
      currentWhitelist: [],
      error: error instanceof Error ? error.message : 'Failed to check whitelist',
      configPath,
    };
  }
}

/**
 * Add a URL to the MT5 WebRequest whitelist
 * 
 * Note: This modifies the terminal's config file. The terminal must be
 * restarted for changes to take effect.
 */
export async function addToWebRequestWhitelist(
  dataPath: string,
  url: string = HEDGE_EDGE_API_URL
): Promise<WebRequestWhitelistResult> {
  const configPath = getConfigPath(dataPath);
  
  try {
    let config: Record<string, Record<string, string>> = {};
    
    // Try to read existing config
    try {
      const content = await fs.readFile(configPath, 'utf-16le');
      config = parseIniFile(content);
    } catch {
      // File doesn't exist, create new config
    }
    
    // Ensure Common section exists
    if (!config['Common']) {
      config['Common'] = {};
    }
    
    // Get current whitelist
    const webRequestValue = config['Common']['WebRequest'] || '';
    const currentWhitelist = webRequestValue
      .split('|')
      .map(u => u.trim())
      .filter(u => u.length > 0);
    
    // Check if already whitelisted
    const isAlreadyWhitelisted = currentWhitelist.some(
      whitelistedUrl => url.startsWith(whitelistedUrl) || whitelistedUrl.startsWith(url)
    );
    
    if (isAlreadyWhitelisted) {
      return { success: true, restartRequired: false };
    }
    
    // Add the URL
    currentWhitelist.push(url);
    config['Common']['WebRequest'] = currentWhitelist.join('|');
    
    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    await fs.mkdir(configDir, { recursive: true });
    
    // Write the config file (MT5 uses UTF-16LE)
    const newContent = serializeIniFile(config);
    await fs.writeFile(configPath, newContent, 'utf-16le');
    
    console.log('[MT5 Whitelist] Added URL to whitelist:', url);
    
    return { success: true, restartRequired: true };
  } catch (error) {
    console.error('[MT5 Whitelist] Failed to add URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update whitelist',
    };
  }
}

/**
 * Get instructions for manually adding WebRequest URL
 */
export function getManualWhitelistInstructions(url: string = HEDGE_EDGE_API_URL): string[] {
  return [
    'Open MetaTrader 5 terminal',
    'Go to Tools → Options → Expert Advisors',
    'Check "Allow WebRequest for listed URL"',
    `Add the following URL to the list: ${url}`,
    'Click "OK" to save',
    'Restart the terminal for changes to take effect',
  ];
}

/**
 * Check all Hedge Edge required URLs
 */
export async function checkAllRequiredUrls(
  dataPath: string
): Promise<{
  allWhitelisted: boolean;
  status: Record<string, boolean>;
}> {
  const status: Record<string, boolean> = {};
  
  for (const url of HEDGE_EDGE_WEBREQUEST_URLS) {
    const result = await checkWebRequestWhitelist(dataPath, url);
    status[url] = result.isWhitelisted;
  }
  
  const allWhitelisted = Object.values(status).every(v => v);
  
  return { allWhitelisted, status };
}
