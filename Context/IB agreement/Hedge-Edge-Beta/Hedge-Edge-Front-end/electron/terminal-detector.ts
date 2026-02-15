/**
 * Terminal Detector Module for HedgeEdge
 * 
 * Comprehensive scanning for MT4/MT5/cTrader terminal installations on Windows.
 * Uses multiple strategies to find terminals in all common locations.
 * 
 * Windows-only feature - other platforms will return empty results.
 */

import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Type Definitions
// ============================================================================

export type TerminalType = 'mt4' | 'mt5' | 'ctrader';

export interface DetectedTerminal {
  /** Unique ID (hash of executable path) */
  id: string;
  /** Terminal type */
  type: TerminalType;
  /** Display name (broker or path-based) */
  name: string;
  /** Full path to executable */
  executablePath: string;
  /** Installation directory */
  installPath: string;
  /** MetaQuotes Terminal GUID if applicable */
  terminalId?: string;
  /** Broker name if detected */
  broker?: string;
  /** Whether terminal process is currently running */
  isRunning?: boolean;
  /** Path where terminal stores data (may differ from install) */
  dataPath?: string;
}

export interface DetectionResult {
  success: boolean;
  terminals: DetectedTerminal[];
  error?: string;
  /** Whether a deep scan was performed */
  deepScan?: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const EXECUTABLES = {
  MT5: ['terminal64.exe', 'terminal.exe'],
  MT4: ['terminal.exe'],
  cTrader: ['cTrader.exe'],
};

// Environment paths
const APPDATA = process.env.APPDATA || '';
const LOCALAPPDATA = process.env.LOCALAPPDATA || '';
const USERPROFILE = process.env.USERPROFILE || '';

// ============================================================================
// Caching & Logging Configuration
// ============================================================================

// Cache for terminal detection results
let cachedTerminals: DetectedTerminal[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache

// Verbose logging flag - set to true only when debugging
let verboseLogging = false;

/**
 * Enable or disable verbose terminal detection logging
 */
export function setTerminalDetectorVerbose(verbose: boolean): void {
  verboseLogging = verbose;
}

/**
 * Log only when verbose mode is explicitly enabled
 */
function debugLog(message: string, ...args: unknown[]): void {
  if (verboseLogging) {
    console.log(message, ...args);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Generate unique ID from path
 */
function generateId(executablePath: string): string {
  // Create a simple hash from the path
  const normalized = executablePath.toLowerCase().replace(/\\/g, '/');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Normalize path for deduplication (lowercase, forward slashes)
 */
function normalizePath(p: string): string {
  return p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Check if a process is running by executable name
 */
async function isProcessRunning(processName: string): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }
  
  try {
    const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${processName}" /NH`, {
      windowsHide: true,
    });
    return stdout.toLowerCase().includes(processName.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Get full paths of all running processes matching the given executable names
 */
async function getRunningProcessPaths(processNames: string[]): Promise<string[]> {
  if (process.platform !== 'win32') {
    return [];
  }
  
  try {
    // Use PowerShell Get-Process instead of deprecated WMIC
    // Build filter for process names (without .exe extension)
    const processNamesNoExt = processNames.map(name => name.replace(/\.exe$/i, ''));
    const filter = processNamesNoExt.map(name => `'${name}'`).join(',');
    
    const psCommand = `Get-Process -Name ${filter} -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -ExpandProperty Path`;
    
    // Use try/catch here because PowerShell exits with code 1 if not ALL process names are found
    // but we still want to capture the stdout which contains found processes
    let stdout = '';
    try {
      const result = await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${psCommand}"`,
        { windowsHide: true, timeout: 10000 }
      );
      stdout = result.stdout;
    } catch (execError: any) {
      // PowerShell exits with code 1 when not all processes found, but stdout still has valid data
      if (execError.stdout) {
        stdout = execError.stdout;
      }
    }
    
    // Parse output - one path per line
    const paths: string[] = [];
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 0) {
        paths.push(trimmed.toLowerCase());
      }
    }
    
    debugLog(`[Terminal Detector] Running terminal paths: ${JSON.stringify(paths)}`);
    debugLog(`[Terminal Detector] Running terminal paths:`, paths);
    return paths;
  } catch (error) {
    // Process not found is normal - not an error
    console.warn('[Terminal Detector] Failed to get running process paths:', error);
    return [];
  }
}

/**
 * Extract broker name from folder/path
 */
function extractBrokerName(folderPath: string): string | undefined {
  const folderName = path.basename(folderPath);
  
  // Pattern: "MetaTrader 5 - BrokerName" or similar
  const patterns = [
    /MetaTrader\s*[45]\s*[-–]\s*(.+)/i,
    /MetaTrader\s*[45]\s+(?!terminal)(.+)/i,
    /MT[45]\s*[-–]\s*(.+)/i,
    /cTrader\s*[-–]\s*(.+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = folderName.match(pattern);
    if (match && match[1]) {
      const broker = match[1].trim();
      // Filter out common non-broker names
      if (!['64', '32', 'Files', 'Programs', 'x86'].includes(broker)) {
        return broker;
      }
    }
  }
  
  // For folders like "MetaTrader-1" or "Metatrader-2", create a friendly name
  const indexMatch = folderName.match(/[Mm]eta[Tt]rader[-_]?(\d+)/);
  if (indexMatch) {
    return `Terminal ${indexMatch[1]}`;
  }
  
  // If folder name is meaningful (not generic), use it as broker hint
  const genericNames = ['metatrader', 'mt4', 'mt5', 'terminal', 'program', 'files', 'x86', '64', '32', 'ctrader'];
  const lowerFolder = folderName.toLowerCase();
  if (!genericNames.some(g => lowerFolder === g || lowerFolder.startsWith(g + ' '))) {
    // Return the folder name if it's not a generic name
    if (folderName.length > 2 && folderName.length < 50) {
      return folderName;
    }
  }
  
  return undefined;
}

/**
 * Extract MetaQuotes Terminal GUID from path
 */
function extractTerminalGuid(filePath: string): string | undefined {
  // Pattern: MetaQuotes\Terminal\<GUID>\
  const match = filePath.match(/MetaQuotes[\\\/]Terminal[\\\/]([A-F0-9]{32})/i);
  return match ? match[1].toUpperCase() : undefined;
}

/**
 * Create display name for terminal
 */
function createDisplayName(type: TerminalType, installPath: string, broker?: string): string {
  const typeNames: Record<TerminalType, string> = {
    mt5: 'MetaTrader 5',
    mt4: 'MetaTrader 4',
    ctrader: 'cTrader',
  };
  
  if (broker) {
    return `${typeNames[type]} - ${broker}`;
  }
  
  // Use last meaningful folder name from path
  const parts = installPath.split(/[\\\/]/).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  
  // If it's a GUID, show parent folder instead
  if (/^[A-F0-9]{32}$/i.test(lastPart) && parts.length > 1) {
    return `${typeNames[type]} (${parts[parts.length - 2]})`;
  }
  
  // If folder name has broker info, use it
  if (lastPart && !lastPart.toLowerCase().includes('metatrader') && 
      !lastPart.toLowerCase().includes('terminal')) {
    return `${typeNames[type]} - ${lastPart}`;
  }
  
  return typeNames[type];
}

/**
 * List directories in a path (non-recursive)
 */
async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => path.join(dirPath, e.name));
  } catch {
    return [];
  }
}

/**
 * Find executable in a directory (checks for MT5/MT4/cTrader executables)
 */
async function findExecutableInDir(dirPath: string): Promise<{ exe: string; type: TerminalType } | null> {
  debugLog(`[Terminal Detector] Looking for executables in: ${dirPath}`);
  
  // Check MT5 first (most common)
  for (const exe of EXECUTABLES.MT5) {
    const exePath = path.join(dirPath, exe);
    debugLog(`[Terminal Detector] Checking: ${exePath}`);
    const exists = await fileExists(exePath);
    debugLog(`[Terminal Detector] ${exePath} exists: ${exists}`);
    if (exists) {
      // Distinguish MT4 from MT5 by checking for terminal64.exe
      if (exe === 'terminal64.exe') {
        return { exe: exePath, type: 'mt5' };
      }
      // terminal.exe could be MT4 or MT5, check folder name
      const folderLower = dirPath.toLowerCase();
      if (folderLower.includes('mt4') || folderLower.includes('metatrader 4') || folderLower.includes('metatrader4')) {
        return { exe: exePath, type: 'mt4' };
      }
      // Default to MT5 for terminal.exe if no MT4 indicators
      return { exe: exePath, type: 'mt5' };
    }
  }
  
  // Check cTrader
  for (const exe of EXECUTABLES.cTrader) {
    const exePath = path.join(dirPath, exe);
    if (await fileExists(exePath)) {
      return { exe: exePath, type: 'ctrader' };
    }
  }
  
  return null;
}

// ============================================================================
// Scan Functions
// ============================================================================

/**
 * Scan MetaQuotes Terminal data folder - this is the MOST RELIABLE source
 * All MT5 instances register here regardless of install location
 */
async function scanMetaQuotesTerminalFolder(): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  const metaQuotesPath = path.join(APPDATA, 'MetaQuotes', 'Terminal');
  
  debugLog(`[Terminal Detector] APPDATA = ${APPDATA}`);
  debugLog(`[Terminal Detector] MetaQuotes path = ${metaQuotesPath}`);
  
  if (!await dirExists(metaQuotesPath)) {
    debugLog('[Terminal Detector] MetaQuotes Terminal folder does not exist');
    return terminals;
  }
  
  debugLog('[Terminal Detector] Scanning MetaQuotes Terminal folder...');
  
  const guidFolders = await listDirectories(metaQuotesPath);
  debugLog(`[Terminal Detector] Found ${guidFolders.length} GUID folders`);
  
  for (const guidFolder of guidFolders) {
    const folderName = path.basename(guidFolder);
    debugLog(`[Terminal Detector] Checking folder: ${folderName}`);
    
    // Skip non-GUID folders
    if (!/^[A-F0-9]{32}$/i.test(folderName)) {
      debugLog(`[Terminal Detector] Skipping non-GUID folder: ${folderName}`);
      continue;
    }
    
    // Check for terminal.exe in this data folder
    const found = await findExecutableInDir(guidFolder);
    if (found) {
      debugLog(`[Terminal Detector] Found terminal in GUID folder: ${found.exe}`);
      const broker = extractBrokerName(guidFolder);
      terminals.push({
        id: generateId(found.exe),
        type: found.type,
        name: createDisplayName(found.type, guidFolder, broker),
        executablePath: found.exe,
        installPath: guidFolder,
        terminalId: folderName.toUpperCase(),
        broker,
        dataPath: guidFolder,
      });
    }
    
    // Also check origin.txt for the actual install location
    const originFile = path.join(guidFolder, 'origin.txt');
    debugLog(`[Terminal Detector] Checking origin.txt: ${originFile}`);
    try {
      // origin.txt is often UTF-16 LE encoded, try multiple encodings
      let originPath = '';
      try {
        const buffer = await fs.readFile(originFile);
        // Check for UTF-16 LE BOM (FF FE)
        if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
          originPath = buffer.slice(2).toString('utf16le').trim();
        } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
          // UTF-16 BE
          originPath = buffer.swap16().slice(2).toString('utf16le').trim();
        } else {
          // Try UTF-8
          originPath = buffer.toString('utf-8').trim();
        }
      } catch {
        const content = await fs.readFile(originFile, 'utf-8');
        originPath = content.trim();
      }
      // Remove any null characters or BOM remnants
      originPath = originPath.replace(/\x00/g, '').replace(/^\uFEFF/, '').trim();
      debugLog(`[Terminal Detector] origin.txt points to: ${originPath}`);
      debugLog(`[Terminal Detector] origin.txt path length: ${originPath.length}, chars: ${[...originPath].map(c => c.charCodeAt(0)).slice(0, 10).join(',')}`);
      
      const originDirExists = await dirExists(originPath);
      debugLog(`[Terminal Detector] Directory exists check for "${originPath}": ${originDirExists}`);
      
      if (originPath && originDirExists) {
        const originFound = await findExecutableInDir(originPath);
        if (originFound) {
          debugLog(`[Terminal Detector] Found terminal at origin path: ${originFound.exe}`);
          const broker = extractBrokerName(originPath);
          terminals.push({
            id: generateId(originFound.exe),
            type: originFound.type,
            name: createDisplayName(originFound.type, originPath, broker),
            executablePath: originFound.exe,
            installPath: originPath,
            terminalId: folderName.toUpperCase(),
            broker,
            dataPath: guidFolder,
          });
        }
      }
    } catch (err) {
      debugLog(`[Terminal Detector] Could not read origin.txt: ${err}`);
    }
  }
  
  debugLog(`[Terminal Detector] MetaQuotes scan found ${terminals.length} terminals`);
  return terminals;
}

/**
 * Scan a directory for terminal installations (1 level deep)
 */
async function scanDirectory(dirPath: string, patterns: string[]): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  
  debugLog(`[Terminal Detector] Scanning directory: ${dirPath}`);
  
  if (!await dirExists(dirPath)) {
    debugLog(`[Terminal Detector] Directory does not exist: ${dirPath}`);
    return terminals;
  }
  
  const subDirs = await listDirectories(dirPath);
  debugLog(`[Terminal Detector] Found ${subDirs.length} subdirectories in ${dirPath}`);
  
  for (const subDir of subDirs) {
    const folderName = path.basename(subDir).toLowerCase();
    
    // Check if folder matches any pattern (remove hyphens/spaces for matching)
    const normalizedFolderName = folderName.replace(/[-_\s]/g, '');
    const matchesPattern = patterns.some(pattern => {
      const p = pattern.toLowerCase().replace(/[-_\s\*]/g, '');
      return normalizedFolderName.includes(p) || folderName.includes(p);
    });
    
    if (matchesPattern) {
      debugLog(`[Terminal Detector] Matched pattern in: ${subDir}`);
    }
    
    if (!matchesPattern) continue;
    
    const found = await findExecutableInDir(subDir);
    if (found) {
      debugLog(`[Terminal Detector] Found executable: ${found.exe} (${found.type})`);
      const broker = extractBrokerName(subDir);
      terminals.push({
        id: generateId(found.exe),
        type: found.type,
        name: createDisplayName(found.type, subDir, broker),
        executablePath: found.exe,
        installPath: subDir,
        broker,
      });
    }
  }
  
  return terminals;
}

/**
 * Scan drive roots for MetaTrader folders
 */
async function scanDriveRoots(): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  const drives = ['C:', 'D:', 'E:', 'F:'];
  const patterns = ['metatrader', 'mt4', 'mt5'];
  
  debugLog('[Terminal Detector] Starting drive root scan...');
  
  for (const drive of drives) {
    const drivePath = `${drive}\\`;
    if (!await dirExists(drivePath)) {
      continue;
    }
    
    const found = await scanDirectory(drivePath, patterns);
    if (found.length > 0) {
      debugLog(`[Terminal Detector] Found ${found.length} terminals on ${drive}`);
    }
    terminals.push(...found);
  }
  
  return terminals;
}

/**
 * Scan Program Files directories
 */
async function scanProgramFiles(): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  const programDirs = [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
  ];
  const patterns = ['metatrader', 'mt4', 'mt5', 'ctrader', 'spotware'];
  
  for (const dir of programDirs) {
    const found = await scanDirectory(dir, patterns);
    terminals.push(...found);
  }
  
  return terminals;
}

/**
 * Scan user folders
 */
async function scanUserFolders(): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  const patterns = ['metatrader', 'mt4', 'mt5', 'ctrader'];
  
  const userDirs = [
    path.join(LOCALAPPDATA, 'Programs'),
    path.join(USERPROFILE, 'Documents'),
    path.join(USERPROFILE, 'Desktop'),
    path.join(USERPROFILE, 'Downloads'),
    APPDATA,
  ].filter(Boolean);
  
  for (const dir of userDirs) {
    const found = await scanDirectory(dir, patterns);
    terminals.push(...found);
  }
  
  return terminals;
}

/**
 * Scan cTrader specific locations
 */
async function scanCTraderLocations(): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  
  const ctraderDirs = [
    path.join(LOCALAPPDATA, 'cTrader'),
    path.join(LOCALAPPDATA, 'Spotware'),
  ].filter(Boolean);
  
  for (const dir of ctraderDirs) {
    if (!await dirExists(dir)) continue;
    
    // cTrader often has version subdirectories
    const subDirs = await listDirectories(dir);
    for (const subDir of subDirs) {
      const found = await findExecutableInDir(subDir);
      if (found) {
        const broker = extractBrokerName(subDir);
        terminals.push({
          id: generateId(found.exe),
          type: found.type,
          name: createDisplayName(found.type, subDir, broker),
          executablePath: found.exe,
          installPath: subDir,
          broker,
        });
      }
    }
    
    // Also check the directory itself
    const found = await findExecutableInDir(dir);
    if (found) {
      terminals.push({
        id: generateId(found.exe),
        type: found.type,
        name: createDisplayName(found.type, dir),
        executablePath: found.exe,
        installPath: dir,
      });
    }
  }
  
  return terminals;
}

/**
 * Deep scan using PowerShell - finds ALL terminals but is SLOW
 */
async function deepScanWithPowerShell(): Promise<DetectedTerminal[]> {
  const terminals: DetectedTerminal[] = [];
  
  if (process.platform !== 'win32') {
    return terminals;
  }
  
  debugLog('[Terminal Detector] Starting deep scan with PowerShell...');
  
  const searchPatterns = [
    { pattern: 'terminal64.exe', type: 'mt5' as TerminalType },
    { pattern: 'terminal.exe', type: 'mt5' as TerminalType }, // Will be refined
    { pattern: 'cTrader.exe', type: 'ctrader' as TerminalType },
  ];
  
  for (const { pattern, type } of searchPatterns) {
    try {
      // Search common drives - limit to reduce time
      const drives = ['C:', 'D:'];
      for (const drive of drives) {
        if (!await dirExists(`${drive}\\`)) continue;
        
        const command = `Get-ChildItem -Path '${drive}\\' -Filter '${pattern}' -Recurse -ErrorAction SilentlyContinue -Depth 6 | Select-Object -ExpandProperty FullName`;
        
        const { stdout } = await execAsync(`powershell -NoProfile -Command "${command}"`, {
          windowsHide: true,
          timeout: 30000, // 30 second timeout per drive
        });
        
        const paths = stdout.trim().split('\n').filter(p => p.trim());
        
        for (const exePath of paths) {
          const trimmedPath = exePath.trim();
          if (!trimmedPath) continue;
          
          const installPath = path.dirname(trimmedPath);
          let detectedType = type;
          
          // Refine type for terminal.exe
          if (pattern === 'terminal.exe') {
            const folderLower = installPath.toLowerCase();
            if (folderLower.includes('mt4') || folderLower.includes('metatrader 4')) {
              detectedType = 'mt4';
            }
          }
          
          const broker = extractBrokerName(installPath);
          const terminalId = extractTerminalGuid(trimmedPath);
          
          terminals.push({
            id: generateId(trimmedPath),
            type: detectedType,
            name: createDisplayName(detectedType, installPath, broker),
            executablePath: trimmedPath,
            installPath,
            terminalId,
            broker,
          });
        }
      }
    } catch (error) {
      console.warn(`[Terminal Detector] Deep scan for ${pattern} failed:`, error);
    }
  }
  
  return terminals;
}

/**
 * Deduplicate terminals by executable path
 */
function deduplicateTerminals(terminals: DetectedTerminal[]): DetectedTerminal[] {
  const seen = new Map<string, DetectedTerminal>();
  
  for (const terminal of terminals) {
    const key = normalizePath(terminal.executablePath);
    
    // Keep the entry with more information
    const existing = seen.get(key);
    if (!existing || 
        (terminal.broker && !existing.broker) ||
        (terminal.terminalId && !existing.terminalId)) {
      seen.set(key, terminal);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Update running status for all terminals by matching actual process paths
 */
async function updateRunningStatus(terminals: DetectedTerminal[]): Promise<void> {
  // Get all running MT4/MT5/cTrader process paths
  const runningPaths = await getRunningProcessPaths([
    'terminal64.exe',
    'terminal.exe', 
    'cTrader.exe'
  ]);
  
  debugLog('[Terminal Detector] Running terminal paths:', runningPaths);
  
  for (const terminal of terminals) {
    // Check if this specific terminal's executable path is in the running processes
    const terminalPathLower = terminal.executablePath.toLowerCase();
    terminal.isRunning = runningPaths.some(runningPath => 
      runningPath === terminalPathLower || 
      normalizePath(runningPath) === normalizePath(terminalPathLower)
    );
  }
}

// ============================================================================
// Main Exports
// ============================================================================

/**
 * Detect all installed trading terminals using fast scan
 * Results are cached for 30 seconds to reduce repeated scans
 */
export async function detectTerminals(): Promise<DetectionResult> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      terminals: [],
      error: 'Terminal detection is only supported on Windows',
    };
  }
  
  // Check cache first
  const now = Date.now();
  if (cachedTerminals && (now - cacheTimestamp) < CACHE_TTL_MS) {
    // Return cached results silently
    return {
      success: true,
      terminals: cachedTerminals,
      deepScan: false,
    };
  }
  
  try {
    const startTime = Date.now();
    
    // Run all fast scans in parallel
    const [
      metaQuotesTerminals,
      driveRootTerminals,
      programFilesTerminals,
      userFolderTerminals,
      ctraderTerminals,
    ] = await Promise.all([
      scanMetaQuotesTerminalFolder(),
      scanDriveRoots(),
      scanProgramFiles(),
      scanUserFolders(),
      scanCTraderLocations(),
    ]);
    
    // Combine all results
    let allTerminals = [
      ...metaQuotesTerminals,
      ...driveRootTerminals,
      ...programFilesTerminals,
      ...userFolderTerminals,
      ...ctraderTerminals,
    ];
    
    // Deduplicate
    allTerminals = deduplicateTerminals(allTerminals);
    
    // Update running status
    await updateRunningStatus(allTerminals);
    
    // Update cache
    cachedTerminals = allTerminals;
    cacheTimestamp = now;
    
    const elapsed = Date.now() - startTime;
    console.log(`[Terminal Detector] Scan complete: ${allTerminals.length} terminals found in ${elapsed}ms`);
    
    return {
      success: true,
      terminals: allTerminals,
      deepScan: false,
    };
  } catch (error) {
    console.error('[Terminal Detector] Error during fast scan:', error);
    return {
      success: false,
      terminals: [],
      error: error instanceof Error ? error.message : 'Failed to scan for terminals',
    };
  }
}

/**
 * Perform deep scan of entire system (SLOW - 30+ seconds)
 */
export async function detectTerminalsDeep(): Promise<DetectionResult> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      terminals: [],
      error: 'Terminal detection is only supported on Windows',
    };
  }
  
  try {
    console.log('[Terminal Detector] Starting deep scan...');
    const startTime = Date.now();
    
    // First do fast scan
    const fastResult = await detectTerminals();
    
    // Then do deep PowerShell scan
    const deepTerminals = await deepScanWithPowerShell();
    
    // Combine and deduplicate
    let allTerminals = deduplicateTerminals([
      ...fastResult.terminals,
      ...deepTerminals,
    ]);
    
    // Update running status
    await updateRunningStatus(allTerminals);
    
    const elapsed = Date.now() - startTime;
    console.log(`[Terminal Detector] Deep scan complete in ${elapsed}ms, found ${allTerminals.length} terminals`);
    
    return {
      success: true,
      terminals: allTerminals,
      deepScan: true,
    };
  } catch (error) {
    console.error('[Terminal Detector] Error during deep scan:', error);
    return {
      success: false,
      terminals: [],
      error: error instanceof Error ? error.message : 'Failed to perform deep scan',
    };
  }
}

/**
 * Launch credentials interface
 */
export interface LaunchCredentials {
  login?: string;
  password?: string;
  server?: string;
}

/**
 * Launch a terminal by executable path, optionally with login credentials
 * 
 * For MT4/MT5, credentials can be passed via command line:
 * terminal64.exe /login:12345 /password:mypass /server:BrokerServer
 * 
 * Note: MT5 uses colon (:) as separator, not equals (=)
 * Important: Arguments must be passed as separate array elements, not joined
 */
export async function launchTerminal(
  executablePath: string, 
  credentials?: LaunchCredentials
): Promise<{ success: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return {
      success: false,
      error: 'Terminal launch is only supported on Windows',
    };
  }
  
  if (!await fileExists(executablePath)) {
    return {
      success: false,
      error: 'Terminal executable not found',
    };
  }
  
  try {
    /**
     * SECURITY NOTE: MT5 terminal accepts credentials only via command-line arguments.
     * These are visible in Task Manager / `tasklist /v` to any process on the machine.
     * This is an MT5 platform limitation — there is no secure alternative.
     *
     * Mitigations in place:
     * - Password masked in our own log output (see args.map below)
     * - Credentials are not stored in plaintext (safeStorage used)
     */
    console.log('[Terminal Detector] Launching terminal:', executablePath);
    
    // Build arguments for MT4/MT5
    const lowerPath = executablePath.toLowerCase();
    const isMetaTrader = lowerPath.includes('terminal64.exe') || lowerPath.includes('terminal.exe');
    
    let args: string[] = [];
    
    if (isMetaTrader && credentials) {
      // MT5 command line format:
      // terminal64.exe /portable /login:12345678 /password:mypassword /server:BrokerName-Server
      // Each argument must be a separate element in the args array
      // Note: /portable flag helps enable command-line login
      // Note: Server must match exactly what's configured in the terminal (case-sensitive)
      
      // Add portable flag first - this can help with command-line auth
      args.push('/portable');
      
      if (credentials.login) {
        args.push(`/login:${credentials.login}`);
      }
      if (credentials.password) {
        args.push(`/password:${credentials.password}`);
      }
      if (credentials.server) {
        args.push(`/server:${credentials.server}`);
      }
    }
    
    console.log('[Terminal Detector] Launching with args:', args.map(a => a.startsWith('/password:') ? '/password:***' : a));
    
    // Get the directory of the executable for the working directory
    const workingDir = path.dirname(executablePath);
    
    // Spawn the terminal - use shell:true on Windows for better compatibility
    const child = spawn(executablePath, args, {
      cwd: workingDir,
      detached: true,
      stdio: 'ignore',
      shell: false, // Don't use shell to avoid escaping issues
      windowsHide: false,
    });
    
    // Unref so the parent process can exit independently
    child.unref();
    
    console.log('[Terminal Detector] Terminal process spawned successfully');
    
    return { success: true };
  } catch (error) {
    console.error('[Terminal Detector] Failed to launch terminal:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to launch terminal',
    };
  }
}
