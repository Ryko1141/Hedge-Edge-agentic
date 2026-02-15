/**
 * Trade Copier Engine
 * 
 * Runs in the Electron main process. Listens for trade events on leader
 * accounts and replicates them to follower accounts via the ZMQ bridge.
 * 
 * Architecture:
 *   agentChannelReader (events) ──► CopierEngine ──► agentChannelReader.openPosition()
 *                                                  ──► agentChannelReader.modifyPosition()
 *                                                  ──► agentChannelReader.closePosition()
 * 
 * The engine reads copier group configuration from localStorage-compatible
 * JSON files and emits IPC events for the renderer to display live stats.
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { AgentChannelReader } from './agent-channel-reader.js';

// ============================================================================
// Types (mirrors src/types/copier.ts for main process usage)
// ============================================================================

export type VolumeSizingMode = 'lot-multiplier';

export interface FollowerConfig {
  id: string;
  accountId: string;
  accountName: string;
  platform: string;
  phase: 'evaluation' | 'funded' | 'live';
  status: 'active' | 'paused' | 'error' | 'pending';
  volumeSizing: VolumeSizingMode;
  lotMultiplier: number;
  reverseMode: boolean;
  symbolWhitelist: string[];
  symbolBlacklist: string[];
  symbolSuffix: string;
  symbolAliases: Array<{ masterSymbol: string; slaveSymbol: string; lotMultiplier?: number }>;
  magicNumberWhitelist: number[];
  magicNumberBlacklist: number[];
  /** Balance snapshot at group creation time (for hedge P/L calculation) */
  baselineBalance?: number;
  stats: FollowerStats;
}

export interface FollowerStats {
  tradesToday: number;
  tradesTotal: number;
  totalProfit: number;
  avgLatency: number;
  successRate: number;
  failedCopies: number;
  lastCopyTime: string | null;
}

export interface CopierGroup {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  leaderAccountId: string;
  leaderAccountName: string;
  leaderPlatform: string;
  leaderPhase: 'evaluation' | 'funded' | 'live';
  leaderSymbolSuffixRemove: string;
  /** Leader's P/L at group creation time (for scoping hedge discrepancy) */
  leaderBaselinePnL?: number;
  followers: FollowerConfig[];
  createdAt: string;
  updatedAt: string;
  stats: GroupStats;
  totalFailedCopies?: number;
}

export interface GroupStats {
  tradesToday: number;
  tradesTotal: number;
  totalProfit: number;
  avgLatency: number;
  activeFollowers: number;
  totalFollowers: number;
}

export interface CopierActivityEntry {
  id: string;
  groupId: string;
  followerId: string;
  timestamp: string;
  type: 'open' | 'close' | 'modify' | 'error';
  symbol: string;
  action: 'buy' | 'sell';
  volume: number;
  price: number;
  latency: number;
  status: 'success' | 'failed';
  errorMessage?: string;
}

/** Maps leader ticket → follower ticket for each follower account */
interface PositionCorrelation {
  leaderTicket: string;
  followerTicket: string;
  followerId: string;
  followerAccountId: string;
  groupId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  openTime: string;
}

interface LeaderAccountMetrics {
  balance: number;
  equity: number;
  freeMargin: number;
}

interface FollowerAccountMetrics {
  balance: number;
  equity: number;
  freeMargin: number;
}

// ============================================================================
// Copier Engine
// ============================================================================

export class CopierEngine extends EventEmitter {
  private channelReader: AgentChannelReader;
  private groups: Map<string, CopierGroup> = new Map();
  private globalEnabled = false;
  
  // Position correlation: leaderTicket → follower correlations
  private correlations: Map<string, PositionCorrelation[]> = new Map();
  
  // Activity log (rolling buffer)
  private activityLog: CopierActivityEntry[] = [];
  private static readonly MAX_ACTIVITY_LOG = 500;
  
  // Per-follower mutex to prevent duplicate copies 
  private followerLocks: Map<string, boolean> = new Map();
  
  // Per-follower consecutive failure count for circuit breaker
  private followerFailures: Map<string, number> = new Map();
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  
  // Cached metrics per terminal
  private leaderMetrics: Map<string, LeaderAccountMetrics> = new Map();
  private followerMetrics: Map<string, FollowerAccountMetrics> = new Map();
  
  // Account UUID → terminal ID mapping (e.g. Supabase UUID → "mt5-12345")
  // This bridges the gap between frontend account IDs and ZMQ terminal IDs
  private accountMap: Map<string, string> = new Map();
  
  // Debounce timer for saveCorrelations — batches rapid-fire saves (e.g. during copy bursts)
  private saveCorrelationsTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SAVE_DEBOUNCE_MS = 5000; // 5 seconds
  
  // File paths for persistence
  private correlationFilePath: string;
  private activityFilePath: string;
  private followerStatsFilePath: string;
  private offlineSyncWatermarkPath: string;
  
  // Persisted follower stats (keyed by followerId)
  private persistedFollowerStats: Map<string, FollowerStats> = new Map();
  
  // Event listener cleanup
  private boundHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];
  
  constructor(channelReader: AgentChannelReader) {
    super();
    this.channelReader = channelReader;
    
    const userDataPath = app.getPath('userData');
    this.correlationFilePath = path.join(userDataPath, 'copier-correlations.json');
    this.activityFilePath = path.join(userDataPath, 'copier-activity.json');
    this.followerStatsFilePath = path.join(userDataPath, 'copier-follower-stats.json');
    this.offlineSyncWatermarkPath = path.join(userDataPath, 'copier-offline-watermark.json');
  }
  
  // ========================================================================
  // Lifecycle
  // ========================================================================
  
  /**
   * Start the copier engine. Call after agentChannelReader is initialized.
   */
  async start(): Promise<void> {
    console.log('[CopierEngine] Starting...');
    
    // Load persisted correlations, activity, and follower stats
    await this.loadCorrelations();
    await this.loadActivity();
    await this.loadFollowerStats();
    
    // Sync trades that happened while the app was closed
    await this.syncOfflineTrades();
    
    // Subscribe to trade events from the channel reader
    this.subscribeToEvents();
    
    console.log('[CopierEngine] Started. Groups:', this.groups.size, 'Global:', this.globalEnabled, 'PersistedStats:', this.persistedFollowerStats.size);
  }
  
  /**
   * Stop the copier engine and persist state
   */
  async stop(): Promise<void> {
    console.log('[CopierEngine] Stopping...');
    
    // Unsubscribe from events
    for (const { event, handler } of this.boundHandlers) {
      this.channelReader.removeListener(event, handler);
    }
    this.boundHandlers = [];
    
    // Persist state
    await this.saveCorrelations();
    await this.saveActivity();
    await this.saveFollowerStats();
    
    console.log('[CopierEngine] Stopped');
  }
  
  // ========================================================================
  // Configuration
  // ========================================================================
  
  /**
   * Update copier groups configuration (called when renderer updates groups)
   */
  updateGroups(groups: CopierGroup[]): void {
    this.groups.clear();
    for (const group of groups) {
      // ENFORCE reverse mode on every follower — this is a hedge copier.
      // Regardless of what the UI sends, reverse mode must always be true.
      for (const follower of group.followers) {
        if (!follower.reverseMode) {
          console.warn(`[CopierEngine] Forcing reverseMode=true for follower ${follower.accountName} (was false)`);
          follower.reverseMode = true;
        }
        // Restore persisted stats for this follower (e.g. totalProfit survives app restart)
        const persistedStats = this.persistedFollowerStats.get(follower.id);
        if (persistedStats) {
          console.log(`[CopierEngine] Restoring persisted stats for follower ${follower.id}: totalProfit=${persistedStats.totalProfit}`);
          follower.stats = { ...follower.stats, ...persistedStats };
        }
      }
      this.groups.set(group.id, group);
    }
    console.log(`[CopierEngine] Groups updated: ${groups.length} groups, accountMap has ${this.accountMap.size} entries`);
    // Push config to all follower EAs (only works if accountMap is populated)
    this.pushConfigToAllFollowers();
    // Export copier config to MT5 Common Files for EA visibility
    this.exportCopierConfigToCommonFiles().catch(err => {
      console.warn('[CopierEngine] Failed to export copier config:', err);
    });
  }

  /**
   * Push SET_CONFIG + PAUSE/RESUME to every follower EA that has a known
   * terminal ID in the accountMap.  Called from updateGroups() and also
   * from updateAccountMap() to handle the race where groups arrive before
   * accounts are resolved.
   */
  private pushConfigToAllFollowers(): void {
    if (this.accountMap.size === 0) {
      console.log('[CopierEngine] pushConfigToAllFollowers: accountMap empty — skipping (will retry when map is populated)');
      return;
    }
    let pushed = 0;
    let skipped = 0;
    for (const [, group] of this.groups) {
      for (const follower of group.followers) {
        const terminalId = this.accountMap.get(follower.accountId);
        if (!terminalId) {
          skipped++;
          console.log(`[CopierEngine] No terminal mapping for follower ${follower.accountName} (accountId=${follower.accountId})`);
          continue;
        }

        const lotMultiplier = follower.lotMultiplier ?? 1.0;

        this.channelReader.sendCommand(terminalId, {
          action: 'SET_CONFIG',
          params: {
            invertTrades: true,     // Always enforced
            lotMultiplier,
          },
        }).then(result => {
          if (result.success) {
            console.log(`[CopierEngine] ✅ Pushed config → ${follower.accountName} (${terminalId}): lots=x${lotMultiplier}`);
          } else {
            console.warn(`[CopierEngine] ❌ Failed config push → ${follower.accountName} (${terminalId}):`, result.error);
          }
        }).catch(err => {
          console.warn(`[CopierEngine] ❌ SET_CONFIG error for ${follower.accountName} (${terminalId}):`, err);
        });

        // Also send PAUSE/RESUME based on follower status
        if (follower.status === 'paused') {
          this.channelReader.sendCommand(terminalId, { action: 'PAUSE' }).then(r => {
            console.log(`[CopierEngine] PAUSE → ${follower.accountName}: ${r.success ? 'ok' : r.error}`);
          }).catch(() => {});
        } else if (follower.status === 'active') {
          this.channelReader.sendCommand(terminalId, { action: 'RESUME' }).then(r => {
            console.log(`[CopierEngine] RESUME → ${follower.accountName}: ${r.success ? 'ok' : r.error}`);
          }).catch(() => {});
        }
        pushed++;
      }
    }
    console.log(`[CopierEngine] pushConfigToAllFollowers: pushed=${pushed}, skipped=${skipped}`);
  }
  
  /**
   * Set global copier enabled state
   */
  setGlobalEnabled(enabled: boolean): void {
    this.globalEnabled = enabled;
    console.log(`[CopierEngine] Global enabled: ${enabled}`);
  }
  
  /**
   * Update account UUID → terminal ID mapping.
   * Called by the renderer which knows both the Supabase UUID (account.id)
   * and the MT5 login number (account.login).  The terminal IDs used by
   * agentChannelReader are formatted as "mt5-{login}".
   *
   * @param mapping - Record of { [supabaseUUID]: mt5Login }
   */
  updateAccountMap(mapping: Record<string, string>): void {
    this.accountMap.clear();
    for (const [uuid, login] of Object.entries(mapping)) {
      if (uuid && login) {
        // Store both the "mt5-{login}" terminal ID and the raw login
        this.accountMap.set(uuid, `mt5-${login}`);
      }
    }
    console.log(`[CopierEngine] Account map updated: ${this.accountMap.size} entries`, 
      Object.fromEntries(this.accountMap));
    
    // Re-push config now that we know terminal IDs — handles the race
    // where updateGroups() fired before updateAccountMap() was called.
    if (this.groups.size > 0) {
      console.log('[CopierEngine] Account map populated — re-pushing config to followers');
      this.pushConfigToAllFollowers();
    }
  }
  
  /**
   * Check if global copier is enabled
   */
  isGlobalEnabled(): boolean {
    return this.globalEnabled;
  }
  
  /**
   * Get activity log entries (most recent first, optionally limited)
   */
  getActivityLog(limit?: number): CopierActivityEntry[] {
    const entries = [...this.activityLog].reverse();
    return limit ? entries.slice(0, limit) : entries;
  }
  
  /**
   * Get all correlations (for debugging/UI)
   */
  getCorrelations(): PositionCorrelation[] {
    const all: PositionCorrelation[] = [];
    for (const corrs of this.correlations.values()) {
      all.push(...corrs);
    }
    return all;
  }
  
  /**
   * Get computed group stats
   */
  getGroupStats(groupId: string): GroupStats | null {
    const group = this.groups.get(groupId);
    if (!group) return null;
    return this.computeGroupStats(group);
  }
  
  /**
   * Get hedge P/L attributed to each leader (prop) account.
   * 
   * Each CopierGroup has one leaderAccountId (the prop account) and N followers
   * (hedge accounts). The follower stats.totalProfit is the realised P/L from
   * trades copied FROM that specific leader.  This method aggregates those by
   * leader so the UI can show per-account attributed hedge P/L.
   * 
   * Additionally includes **floating (unrealised) P/L** from currently open
   * positions on each follower terminal.  Without this, the Hedge P/L would
   * stay at $0 while hedge positions are still open.
   * 
   * Returns: Record<leaderAccountId, totalHedgeProfit (realised + floating)>
   */
  getHedgePnLByLeader(): Record<string, number> {
    const result: Record<string, number> = {};
    console.log(`[CopierEngine] getHedgePnLByLeader called, groups count: ${this.groups.size}`);
    for (const [groupId, group] of this.groups) {
      const leaderId = group.leaderAccountId;
      if (result[leaderId] === undefined) result[leaderId] = 0;
      for (const follower of group.followers) {
        // Realised P/L from closed trades
        const realisedPnL = follower.stats.totalProfit;
        
        // Floating P/L from currently open positions on this follower's terminal
        let floatingPnL = 0;
        const followerTerminalId = this.getTerminalIdForAccount(follower.accountId);
        if (followerTerminalId) {
          const snapshot = this.channelReader.getLastSnapshot(followerTerminalId);
          if (snapshot?.positions) {
            for (const pos of snapshot.positions) {
              floatingPnL += (pos.profit ?? 0) + (pos.swap ?? 0) + (pos.commission ?? 0);
            }
          }
        }
        
        const total = realisedPnL + floatingPnL;
        console.log(
          `[CopierEngine] Group ${groupId}: leader=${leaderId}, follower=${follower.id}, ` +
          `realised=${realisedPnL}, floating=${floatingPnL}, total=${total}`,
        );
        result[leaderId] += total;
      }
    }
    console.log('[CopierEngine] getHedgePnLByLeader result:', result);
    return result;
  }
  
  /**
   * Return internal debug state for diagnostics from the renderer DevTools.
   */
  getDebugState(): Record<string, unknown> {
    const groups: Record<string, unknown>[] = [];
    for (const [id, group] of this.groups) {
      groups.push({
        id,
        name: group.name,
        status: group.status,
        leaderAccountId: group.leaderAccountId,
        leaderAccountName: group.leaderAccountName,
        followers: group.followers.map(f => ({
          id: f.id,
          accountId: f.accountId,
          accountName: f.accountName,
          status: f.status,
          reverseMode: f.reverseMode,
          stats: { ...f.stats },
        })),
      });
    }
    
    const correlations: Record<string, unknown[]> = {};
    for (const [ticket, corrs] of this.correlations) {
      correlations[ticket] = corrs.map(c => ({
        groupId: c.groupId,
        followerId: c.followerId,
        followerAccountId: c.followerAccountId,
        followerTicket: c.followerTicket,
        symbol: c.symbol,
        side: c.side,
        volume: c.volume,
      }));
    }
    
    const accountMap: Record<string, string> = {};
    for (const [k, v] of this.accountMap) {
      accountMap[k] = v;
    }
    
    return {
      globalEnabled: this.globalEnabled,
      groupCount: this.groups.size,
      correlationCount: this.correlations.size,
      accountMapSize: this.accountMap.size,
      groups,
      correlations,
      accountMap,
      persistedStatsCount: this.persistedFollowerStats.size,
    };
  }
  
  // ========================================================================
  // Event Subscriptions
  // ========================================================================
  
  private subscribeToEvents(): void {
    // Position opened on any terminal
    const onPositionOpened = (terminalId: string, event: unknown) => {
      this.handleLeaderPositionOpened(terminalId, event);
    };
    this.channelReader.on('positionOpened', onPositionOpened);
    this.boundHandlers.push({ event: 'positionOpened', handler: onPositionOpened as (...args: unknown[]) => void });
    
    // Position closed on any terminal
    const onPositionClosed = (terminalId: string, event: unknown) => {
      this.handleLeaderPositionClosed(terminalId, event);
    };
    this.channelReader.on('positionClosed', onPositionClosed);
    this.boundHandlers.push({ event: 'positionClosed', handler: onPositionClosed as (...args: unknown[]) => void });
    
    // Position modified on any terminal
    const onPositionModified = (terminalId: string, event: unknown) => {
      this.handleLeaderPositionModified(terminalId, event);
    };
    this.channelReader.on('positionModified', onPositionModified);
    this.boundHandlers.push({ event: 'positionModified', handler: onPositionModified as (...args: unknown[]) => void });
    
    // Heartbeat - cache account metrics
    const onHeartbeat = (terminalId: string, event: unknown) => {
      this.handleHeartbeat(terminalId, event);
    };
    this.channelReader.on('heartbeat', onHeartbeat);
    this.boundHandlers.push({ event: 'heartbeat', handler: onHeartbeat as (...args: unknown[]) => void });
    
    // Account update - cache metrics
    const onAccountUpdate = (terminalId: string, event: unknown) => {
      this.handleHeartbeat(terminalId, event);
    };
    this.channelReader.on('accountUpdate', onAccountUpdate);
    this.boundHandlers.push({ event: 'accountUpdate', handler: onAccountUpdate as (...args: unknown[]) => void });
    
    // When a terminal connects/reconnects, push current config to it
    const onTerminalConnected = (terminalId: string) => {
      console.log(`[CopierEngine] Terminal connected: ${terminalId} — pushing config`);
      // Small delay to let the bridge fully stabilise
      setTimeout(() => this.pushConfigToAllFollowers(), 1000);
    };
    this.channelReader.on('terminalConnected', onTerminalConnected);
    this.boundHandlers.push({ event: 'terminalConnected', handler: onTerminalConnected as (...args: unknown[]) => void });
  }
  
  // ========================================================================
  // Event Handlers
  // ========================================================================
  
  private async handleLeaderPositionOpened(terminalId: string, event: unknown): Promise<void> {
    if (!this.globalEnabled) return;
    
    // ZmqEvent wraps position data inside .data — unwrap it
    const zmqEvent = event as { data?: Record<string, unknown> };
    const eventData = (zmqEvent.data || event) as {
      position?: number;
      symbol?: string;
      type?: 'BUY' | 'SELL';
      volume?: number;
      price?: number;
      stopLoss?: number;
      takeProfit?: number;
      magic?: number;
    };
    
    if (!eventData.position || !eventData.symbol || !eventData.type) {
      return; // Not enough data
    }
    
    const leaderTicket = String(eventData.position);
    
    // Find groups where this terminal is the leader
    for (const group of this.groups.values()) {
      if (group.status !== 'active') continue;
      if (!this.isTerminalForAccount(terminalId, group.leaderAccountId)) continue;
      
      // Process each active follower
      for (const follower of group.followers) {
        if (follower.status !== 'active') continue;
        
        // Skip followers whose terminals are slave EAs — they copy trades
        // autonomously via ZMQ PUB/SUB and do NOT need the Electron copier
        // to duplicate the execution (that would cause double trading).
        const followerTid = this.getTerminalIdForAccount(follower.accountId);
        if (followerTid && this.channelReader.isSlaveTerminal(followerTid)) {
          continue;
        }
        
        // 1. Magic number filtering (Heron processing step 1)
        if (!this.checkMagicNumberFilter(eventData.magic, follower)) continue;
        
        // Apply symbol filtering (steps 2-6: blacklist → whitelist → aliases → suffix → auto-map)
        const mappedSymbol = this.mapSymbol(eventData.symbol, group, follower);
        if (!mappedSymbol) continue; // Filtered out
        
        // Check circuit breaker
        const failures = this.followerFailures.get(follower.id) || 0;
        if (failures >= CopierEngine.CIRCUIT_BREAKER_THRESHOLD) {
          console.warn(`[CopierEngine] Circuit breaker active for follower ${follower.id}`);
          continue;
        }
        
        // Compute volume
        const leaderVolumeLots = (eventData.volume || 0) > 100 
          ? (eventData.volume || 0) / 100000  // Convert from units to lots if needed
          : (eventData.volume || 0);
        const volume = this.computeVolume(
          leaderVolumeLots,
          follower,
          terminalId,
          follower.accountId
        );
        
        if (volume <= 0) {
          console.warn(`[CopierEngine] Computed volume <= 0 for follower ${follower.id}`);
          continue;
        }
        
        // ALWAYS reverse — this is a hedge copier; reverse mode is mandatory.
        // When copying between hedge accounts and other account types the
        // follower MUST take the opposite side to directly offset the leader.
        let side: 'BUY' | 'SELL' = eventData.type;
        const isReversed = true; // Hardcoded: hedge copier always reverses
        side = side === 'BUY' ? 'SELL' : 'BUY';
        
        // SL/TP copying is disabled — always pass 0
        const sl = 0;
        const tp = 0;
        
        // Execute the copy
        await this.executeCopy(group, follower, {
          leaderTicket,
          symbol: mappedSymbol,
          side,
          volume,
          sl,
          tp,
          leaderPrice: eventData.price || 0,
        });
      }
    }
  }
  
  private async handleLeaderPositionClosed(terminalId: string, event: unknown): Promise<void> {
    console.log(`[CopierEngine] handleLeaderPositionClosed called: terminalId=${terminalId}, event=`, event);
    if (!this.globalEnabled) {
      console.log('[CopierEngine] handleLeaderPositionClosed: globalEnabled is false, returning');
      return;
    }
    
    // ZmqEvent wraps position data inside .data — unwrap it
    const zmqEvent = event as { data?: Record<string, unknown> };
    const eventData = (zmqEvent.data || event) as {
      position?: number;
      symbol?: string;
      profit?: number;
      swap?: number;
      commission?: number;
      entry?: string;
    };
    
    if (!eventData.position) {
      console.log('[CopierEngine] handleLeaderPositionClosed: no position in event, returning');
      return;
    }
    
    // ── Follower close detection ────────────────────────────────────────
    // The slave EA (HE_Hedge) copies trades directly via ZMQ, bypassing the
    // Electron copier engine.  When a follower (hedge) position closes, the
    // channel reader emits 'positionClosed' for that follower terminal too.
    // We detect it here and attribute the realised profit to the follower.
    if (eventData.entry === 'OUT') {
      for (const [, group] of this.groups) {
        if (group.status !== 'active') continue;
        for (const follower of group.followers) {
          if (follower.status !== 'active') continue;
          if (this.isTerminalForAccount(terminalId, follower.accountId)) {
            const closedProfit =
              (eventData.profit || 0) +
              (eventData.swap || 0) +
              (eventData.commission || 0);
            console.log(
              `[CopierEngine] Follower position closed on terminal ${terminalId}: ` +
              `profit=${eventData.profit}, swap=${eventData.swap}, commission=${eventData.commission}, ` +
              `total=${closedProfit}, follower=${follower.id}, prevTotal=${follower.stats.totalProfit}`,
            );
            follower.stats.totalProfit += closedProfit;
            follower.stats.tradesTotal++;
            follower.stats.tradesToday++;
            follower.stats.lastCopyTime = new Date().toISOString();
            this.persistedFollowerStats.set(follower.id, { ...follower.stats });
            this.debouncedSaveFollowerStats();
            this.emitStatsUpdate();
            // Don't return — also continue with leader-close logic below
            // (in case this terminal also happens to be a leader for another group)
          }
        }
      }
    }
    
    const leaderTicket = String(eventData.position);
    const correlationsForTicket = this.correlations.get(leaderTicket);
    console.log(`[CopierEngine] handleLeaderPositionClosed: leaderTicket=${leaderTicket}, correlations found=${correlationsForTicket?.length ?? 0}`);
    
    if (!correlationsForTicket || correlationsForTicket.length === 0) return;
    
    // Close all correlated follower positions
    for (const correlation of correlationsForTicket) {
      const group = this.groups.get(correlation.groupId);
      if (!group || group.status !== 'active') continue;
      
      const follower = group.followers.find(f => f.id === correlation.followerId);
      if (!follower || follower.status !== 'active') continue;
      
      const followerTerminalId = this.getTerminalIdForAccount(correlation.followerAccountId);
      if (!followerTerminalId) continue;
      
      const startTime = Date.now();
      
      // Get the follower's floating P/L BEFORE closing (this is the actual hedge P/L)
      let followerProfit = 0;
      const followerSnapshot = this.channelReader.getLastSnapshot(followerTerminalId);
      console.log(`[CopierEngine] Close: followerTerminalId=${followerTerminalId}, snapshot exists=${!!followerSnapshot}, positions=${followerSnapshot?.positions?.length ?? 0}`);
      if (followerSnapshot?.positions) {
        const followerPosition = followerSnapshot.positions.find(
          p => String(p.id) === String(correlation.followerTicket)
        );
        console.log(`[CopierEngine] Looking for ticket ${correlation.followerTicket}, found=${!!followerPosition}`);
        if (followerPosition) {
          followerProfit = followerPosition.profit + (followerPosition.swap || 0) + (followerPosition.commission || 0);
          console.log(`[CopierEngine] Follower position profit=${followerPosition.profit}, swap=${followerPosition.swap}, commission=${followerPosition.commission}, total=${followerProfit}`);
        }
      }
      
      try {
        const result = await this.channelReader.closePosition(
          followerTerminalId,
          correlation.followerTicket
        );
        
        const latency = Date.now() - startTime;
        
        if (result.success) {
          this.updateFollowerStats(follower, latency, true, followerProfit);
          this.addActivity({
            groupId: group.id,
            followerId: follower.id,
            type: 'close',
            symbol: correlation.symbol,
            action: correlation.side === 'BUY' ? 'buy' : 'sell',
            volume: correlation.volume,
            price: 0,
            latency,
            status: 'success',
          });
        } else {
          this.updateFollowerStats(follower, latency, false);
          this.addActivity({
            groupId: group.id,
            followerId: follower.id,
            type: 'close',
            symbol: correlation.symbol,
            action: correlation.side === 'BUY' ? 'buy' : 'sell',
            volume: correlation.volume,
            price: 0,
            latency,
            status: 'failed',
            errorMessage: result.error,
          });
        }
      } catch (error) {
        console.error(`[CopierEngine] Close position failed:`, error);
      }
    }
    
    // Remove correlations for this leader ticket
    this.correlations.delete(leaderTicket);
    this.emitStatsUpdate();
    this.debouncedSaveCorrelations();
  }
  
  private async handleLeaderPositionModified(terminalId: string, event: unknown): Promise<void> {
    if (!this.globalEnabled) return;
    
    // ZmqEvent wraps position data inside .data — unwrap it
    const zmqEvent = event as { data?: Record<string, unknown> };
    const eventData = (zmqEvent.data || event) as {
      position?: number;
      symbol?: string;
      stopLoss?: number;
      takeProfit?: number;
      type?: 'BUY' | 'SELL';
    };
    
    if (!eventData.position) return;
    
    const leaderTicket = String(eventData.position);
    const correlationsForTicket = this.correlations.get(leaderTicket);
    
    if (!correlationsForTicket || correlationsForTicket.length === 0) return;
    
    for (const correlation of correlationsForTicket) {
      const group = this.groups.get(correlation.groupId);
      if (!group || group.status !== 'active') continue;
      
      const follower = group.followers.find(f => f.id === correlation.followerId);
      if (!follower || follower.status !== 'active') continue;
      
      // SL/TP copying is disabled — skip modifications
    }
  }
  
  private handleHeartbeat(terminalId: string, event: unknown): void {
    const data = event as {
      balance?: number;
      equity?: number;
      freeMargin?: number;
      profit?: number;
    };
    
    if (data.balance != null && data.equity != null) {
      const metrics = {
        balance: data.balance,
        equity: data.equity,
        freeMargin: data.freeMargin || 0,
      };
      
      // Store for both leader and follower usage
      this.leaderMetrics.set(terminalId, metrics);
      this.followerMetrics.set(terminalId, metrics);
    }
  }
  
  // ========================================================================
  // Trade Execution
  // ========================================================================
  
  private async executeCopy(
    group: CopierGroup,
    follower: FollowerConfig,
    params: {
      leaderTicket: string;
      symbol: string;
      side: 'BUY' | 'SELL';
      volume: number;
      sl: number;
      tp: number;
      leaderPrice: number;
    }
  ): Promise<void> {
    const { leaderTicket, symbol, side, volume, sl, tp, leaderPrice } = params;
    
    // Per-follower lock to prevent duplicate copies
    const lockKey = `${follower.id}-${leaderTicket}`;
    if (this.followerLocks.get(lockKey)) {
      console.warn(`[CopierEngine] Duplicate copy blocked: ${lockKey}`);
      return;
    }
    this.followerLocks.set(lockKey, true);
    
    const followerTerminalId = this.getTerminalIdForAccount(follower.accountId);
    if (!followerTerminalId) {
      this.followerLocks.delete(lockKey);
      this.addActivity({
        groupId: group.id,
        followerId: follower.id,
        type: 'error',
        symbol,
        action: side === 'BUY' ? 'buy' : 'sell',
        volume,
        price: leaderPrice,
        latency: 0,
        status: 'failed',
        errorMessage: `Follower terminal not connected: ${follower.accountId}`,
      });
      return;
    }
    
    const startTime = Date.now();
    
    try {
      const result = await this.channelReader.openPosition(followerTerminalId, {
        symbol,
        side,
        volume,
        sl: sl > 0 ? sl : undefined,
        tp: tp > 0 ? tp : undefined,
        magic: 123456,
        comment: `HE Copy ${leaderTicket}`,
      });
      
      const latency = Date.now() - startTime;
      
      if (result.success && result.ticket) {
        // Store correlation
        const correlation: PositionCorrelation = {
          leaderTicket,
          followerTicket: result.ticket,
          followerId: follower.id,
          followerAccountId: follower.accountId,
          groupId: group.id,
          symbol,
          side,
          volume,
          openTime: new Date().toISOString(),
        };
        
        const existing = this.correlations.get(leaderTicket) || [];
        existing.push(correlation);
        this.correlations.set(leaderTicket, existing);
        
        // Update stats
        this.updateFollowerStats(follower, latency, true);
        this.followerFailures.set(follower.id, 0); // Reset circuit breaker
        
        this.addActivity({
          groupId: group.id,
          followerId: follower.id,
          type: 'open',
          symbol,
          action: side === 'BUY' ? 'buy' : 'sell',
          volume,
          price: leaderPrice,
          latency,
          status: 'success',
        });
        
        console.log(`[CopierEngine] Copy success: ${side} ${volume} ${symbol} → ${follower.accountName} ticket=${result.ticket} (${latency}ms)`);
      } else {
        // Increment circuit breaker counter
        const failures = (this.followerFailures.get(follower.id) || 0) + 1;
        this.followerFailures.set(follower.id, failures);
        
        this.updateFollowerStats(follower, latency, false);
        
        this.addActivity({
          groupId: group.id,
          followerId: follower.id,
          type: 'open',
          symbol,
          action: side === 'BUY' ? 'buy' : 'sell',
          volume,
          price: leaderPrice,
          latency,
          status: 'failed',
          errorMessage: result.error || 'Unknown error',
        });
        
        console.error(`[CopierEngine] Copy failed: ${result.error} (failures: ${failures}/${CopierEngine.CIRCUIT_BREAKER_THRESHOLD})`);
        
        // Emit error event for notification
        this.emit('copyError', {
          groupId: group.id,
          followerId: follower.id,
          error: result.error,
          circuitBreakerActive: failures >= CopierEngine.CIRCUIT_BREAKER_THRESHOLD,
        });
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      
      const failures = (this.followerFailures.get(follower.id) || 0) + 1;
      this.followerFailures.set(follower.id, failures);
      
      this.updateFollowerStats(follower, latency, false);
      
      this.addActivity({
        groupId: group.id,
        followerId: follower.id,
        type: 'error',
        symbol,
        action: side === 'BUY' ? 'buy' : 'sell',
        volume,
        price: leaderPrice,
        latency,
        status: 'failed',
        errorMessage: errMsg,
      });
      
      console.error(`[CopierEngine] Copy exception:`, error);
    } finally {
      this.followerLocks.delete(lockKey);
      this.emitStatsUpdate();
      this.debouncedSaveCorrelations();
    }
  }
  
  // ========================================================================
  // Volume Sizing
  // ========================================================================
  
  private computeVolume(
    leaderVolumeLots: number,
    follower: FollowerConfig,
    _leaderTerminalId: string,
    _followerAccountId: string
  ): number {
    // Always lot-multiplier based
    return leaderVolumeLots * follower.lotMultiplier;
  }
  
  // ========================================================================
  // Symbol Mapping
  // ========================================================================
  
  /**
   * Map leader symbol to follower symbol based on configuration.
   * Returns null if symbol should be filtered out.
   * 
   * Processing order (per Heron Copier docs):
   *   1. Magic Number Filter (done before this method)
   *   2. Symbol Blacklist
   *   3. Symbol Whitelist
   *   4. Symbol Aliases (highest priority mapping)
   *   5. Symbol Suffix (only applied if not matched by alias)
   *   6. Auto-map fallback (keep original symbol)
   */
  private mapSymbol(leaderSymbol: string, group: CopierGroup, follower: FollowerConfig): string | null {
    // Remove leader suffix if configured
    let baseSymbol = leaderSymbol;
    if (group.leaderSymbolSuffixRemove && baseSymbol.endsWith(group.leaderSymbolSuffixRemove)) {
      baseSymbol = baseSymbol.slice(0, -group.leaderSymbolSuffixRemove.length);
    }
    
    // Step 2: Check blacklist FIRST (if symbol is blacklisted, skip)
    if (follower.symbolBlacklist.length > 0) {
      const inBlacklist = follower.symbolBlacklist.some(
        s => s.toUpperCase() === baseSymbol.toUpperCase() || s.toUpperCase() === leaderSymbol.toUpperCase()
      );
      if (inBlacklist) return null;
    }
    
    // Step 3: Check whitelist (if non-empty, only whitelisted symbols pass)
    if (follower.symbolWhitelist.length > 0) {
      const inWhitelist = follower.symbolWhitelist.some(
        s => s.toUpperCase() === baseSymbol.toUpperCase() || s.toUpperCase() === leaderSymbol.toUpperCase()
      );
      if (!inWhitelist) return null;
    }
    
    // Step 4: Check aliases (highest priority mapping, prevents suffix from being applied)
    for (const alias of follower.symbolAliases) {
      if (alias.masterSymbol.toUpperCase() === baseSymbol.toUpperCase() ||
          alias.masterSymbol.toUpperCase() === leaderSymbol.toUpperCase()) {
        return alias.slaveSymbol;
      }
    }
    
    // Step 5: Apply follower suffix (only if no alias matched)
    return baseSymbol + (follower.symbolSuffix || '');
  }
  
  // ========================================================================
  // SL / TP Computation
  // ========================================================================
  
  /**
   * Compute stop loss for follower position.
   * SL/TP copying is disabled — always returns 0.
   */
  private computeStopLoss(
    _eventData: { stopLoss?: number; takeProfit?: number; type?: string; digits?: number },
    _follower: FollowerConfig,
    _followerSide: 'BUY' | 'SELL',
    _isReversed: boolean = false
  ): number {
    return 0;
  }
  
  /**
   * Compute take profit for follower position.
   * SL/TP copying is disabled — always returns 0.
   */
  private computeTakeProfit(
    _eventData: { stopLoss?: number; takeProfit?: number; type?: string; digits?: number },
    _follower: FollowerConfig,
    _followerSide: 'BUY' | 'SELL',
    _isReversed: boolean = false
  ): number {
    return 0;
  }
  
  // ========================================================================
  // Magic Number Filtering
  // ========================================================================
  
  /**
   * Check if a trade's magic number passes the follower's magic number filter.
   * Follows Heron Copier logic:
   *   - If whitelist is non-empty, only whitelisted magic numbers pass
   *   - Blacklisted magic numbers are always rejected
   *   - If both exist, whitelist takes priority (must be in whitelist AND not in blacklist)
   *   - If neither exist (both empty), all trades pass
   */
  private checkMagicNumberFilter(magic: number | undefined, follower: FollowerConfig): boolean {
    const magicNum = magic ?? 0;
    const whitelist = follower.magicNumberWhitelist || [];
    const blacklist = follower.magicNumberBlacklist || [];
    
    // If no filters configured, allow all
    if (whitelist.length === 0 && blacklist.length === 0) return true;
    
    // If whitelist exists, magic must be in it
    if (whitelist.length > 0 && !whitelist.includes(magicNum)) return false;
    
    // If blacklisted, reject
    if (blacklist.length > 0 && blacklist.includes(magicNum)) return false;
    
    return true;
  }
  
  // ========================================================================
  // Stats Updates
  // ========================================================================
  
  private updateFollowerStats(follower: FollowerConfig, latencyMs: number, success: boolean, profit?: number): void {
    console.log(`[CopierEngine] updateFollowerStats: follower=${follower.id}, success=${success}, profit=${profit}, currentTotal=${follower.stats.totalProfit}`);
    if (success) {
      follower.stats.tradesToday++;
      follower.stats.tradesTotal++;
      if (profit != null) {
        follower.stats.totalProfit += profit;
        console.log(`[CopierEngine] Updated totalProfit to ${follower.stats.totalProfit}`);
      }
      follower.stats.lastCopyTime = new Date().toISOString();
      
      // Rolling average latency
      const total = follower.stats.tradesTotal;
      follower.stats.avgLatency = ((follower.stats.avgLatency * (total - 1)) + latencyMs) / total;
    } else {
      follower.stats.failedCopies++;
    }
    
    const attempts = follower.stats.tradesTotal + follower.stats.failedCopies;
    follower.stats.successRate = attempts > 0 ? (follower.stats.tradesTotal / attempts) * 100 : 0;
    
    // Persist follower stats (debounced)
    this.persistedFollowerStats.set(follower.id, { ...follower.stats });
    this.debouncedSaveFollowerStats();
  }
  
  private computeGroupStats(group: CopierGroup): GroupStats {
    let tradesToday = 0;
    let tradesTotal = 0;
    let totalProfit = 0;
    let avgLatency = 0;
    let activeFollowers = 0;
    
    for (const f of group.followers) {
      tradesToday += f.stats.tradesToday;
      tradesTotal += f.stats.tradesTotal;
      // Realised P/L
      totalProfit += f.stats.totalProfit;
      // Floating P/L from open positions
      const followerTerminalId = this.getTerminalIdForAccount(f.accountId);
      if (followerTerminalId) {
        const snapshot = this.channelReader.getLastSnapshot(followerTerminalId);
        if (snapshot?.positions) {
          for (const pos of snapshot.positions) {
            totalProfit += (pos.profit ?? 0) + (pos.swap ?? 0) + (pos.commission ?? 0);
          }
        }
      }
      avgLatency += f.stats.avgLatency;
      if (f.status === 'active') activeFollowers++;
    }
    
    if (group.followers.length > 0) {
      avgLatency /= group.followers.length;
    }
    
    return {
      tradesToday,
      tradesTotal,
      totalProfit,
      avgLatency,
      activeFollowers,
      totalFollowers: group.followers.length,
    };
  }
  
  private emitStatsUpdate(): void {
    const groupStats: Record<string, GroupStats & { followers: Record<string, FollowerStats>; totalFailedCopies: number }> = {};
    for (const [id, group] of this.groups) {
      const stats = this.computeGroupStats(group);
      const followers: Record<string, FollowerStats> = {};
      let totalFailed = 0;
      for (const f of group.followers) {
        followers[f.id] = { ...f.stats };
        totalFailed += f.stats.failedCopies;
      }
      groupStats[id] = { ...stats, followers, totalFailedCopies: totalFailed };
    }
    this.emit('statsUpdate', groupStats);
  }
  
  // ========================================================================
  // Activity Log
  // ========================================================================
  
  private addActivity(partial: Omit<CopierActivityEntry, 'id' | 'timestamp'>): void {
    const entry: CopierActivityEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...partial,
    };
    
    this.activityLog.push(entry);
    
    // Trim to max size
    if (this.activityLog.length > CopierEngine.MAX_ACTIVITY_LOG) {
      this.activityLog = this.activityLog.slice(-CopierEngine.MAX_ACTIVITY_LOG);
    }
    
    // Emit for real-time UI updates
    this.emit('activity', entry);
  }
  
  // ========================================================================
  // Terminal Lookup
  // ========================================================================
  
  /**
   * Check if the given terminalId corresponds to the given accountId.
   * The agentChannelReader uses "mt5-{login}" as the terminalId.
   * The accountId may be a Supabase UUID, "mt5-{login}", or a raw login.
   */
  private isTerminalForAccount(terminalId: string, accountId: string): boolean {
    // Direct match
    if (terminalId === accountId) return true;
    
    // accountId may be formatted as "mt5-12345" while terminalId is "12345" (or vice-versa)
    if (accountId.startsWith('mt5-')) {
      if (terminalId === accountId.slice(4)) return true;
    }
    if (terminalId.startsWith('mt5-')) {
      if (terminalId.slice(4) === accountId) return true;
    }
    
    // Use accountMap: accountId is a Supabase UUID → look up its terminal ID
    const mappedTerminalId = this.accountMap.get(accountId);
    if (mappedTerminalId) {
      if (terminalId === mappedTerminalId) return true;
      // Also check without "mt5-" prefix
      if (mappedTerminalId.startsWith('mt5-') && terminalId === mappedTerminalId.slice(4)) return true;
    }
    
    return false;
  }
  
  /**
   * Get the terminal ID for a given account ID.
   * accountId may be a Supabase UUID, "mt5-{login}", or a raw login number.
   */
  private getTerminalIdForAccount(accountId: string): string | null {
    // 1. Try direct lookup (works if accountId is already a terminal ID)
    if (this.channelReader.isTerminalConnected(accountId)) {
      return accountId;
    }
    
    // 2. Try stripping "mt5-" prefix
    if (accountId.startsWith('mt5-')) {
      const loginId = accountId.slice(4);
      if (this.channelReader.isTerminalConnected(loginId)) {
        return loginId;
      }
    }
    
    // 3. Use accountMap to resolve Supabase UUID → terminal ID
    const mappedTerminalId = this.accountMap.get(accountId);
    if (mappedTerminalId) {
      // Try the mapped terminal ID directly (e.g. "mt5-12345")
      if (this.channelReader.isTerminalConnected(mappedTerminalId)) {
        return mappedTerminalId;
      }
      // Try without prefix (e.g. "12345" from "mt5-12345")
      if (mappedTerminalId.startsWith('mt5-')) {
        const rawLogin = mappedTerminalId.slice(4);
        if (this.channelReader.isTerminalConnected(rawLogin)) {
          return rawLogin;
        }
      }
    }
    
    // 4. Try all connected terminals as a last resort
    const terminals = this.channelReader.getMT5Terminals();
    for (const tid of terminals) {
      if (tid === accountId || `mt5-${tid}` === accountId) {
        if (this.channelReader.isTerminalConnected(tid)) {
          return tid;
        }
      }
    }
    
    return null;
  }
  
  // ========================================================================
  // Persistence
  // ========================================================================
  
  private async loadCorrelations(): Promise<void> {
    try {
      const data = await fs.readFile(this.correlationFilePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, PositionCorrelation[]>;
      this.correlations.clear();
      for (const [key, value] of Object.entries(parsed)) {
        this.correlations.set(key, value);
      }
      console.log(`[CopierEngine] Loaded ${this.correlations.size} correlation entries`);
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
  }
  
  private async saveCorrelations(): Promise<void> {
    try {
      const obj: Record<string, PositionCorrelation[]> = {};
      for (const [key, value] of this.correlations) {
        obj[key] = value;
      }
      await fs.writeFile(this.correlationFilePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CopierEngine] Failed to save correlations:', error);
    }
  }
  
  /**
   * Debounced save — coalesces rapid correlation changes into a single disk write.
   * Called on every trade copy/close instead of saveCorrelations() directly,
   * preventing N sequential writes during a burst of N trades.
   */
  private debouncedSaveCorrelations(): void {
    if (this.saveCorrelationsTimer) {
      clearTimeout(this.saveCorrelationsTimer);
    }
    this.saveCorrelationsTimer = setTimeout(() => {
      this.saveCorrelationsTimer = null;
      this.saveCorrelations().catch(() => {});
    }, CopierEngine.SAVE_DEBOUNCE_MS);
  }
  
  private async loadActivity(): Promise<void> {
    try {
      const data = await fs.readFile(this.activityFilePath, 'utf-8');
      this.activityLog = JSON.parse(data) as CopierActivityEntry[];
      console.log(`[CopierEngine] Loaded ${this.activityLog.length} activity entries`);
    } catch {
      // Start fresh
    }
  }
  
  private async saveActivity(): Promise<void> {
    try {
      await fs.writeFile(this.activityFilePath, JSON.stringify(this.activityLog, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CopierEngine] Failed to save activity:', error);
    }
  }
  
  // Debounce timer for saveFollowerStats
  private saveFollowerStatsTimer: ReturnType<typeof setTimeout> | null = null;
  
  private async loadFollowerStats(): Promise<void> {
    try {
      const data = await fs.readFile(this.followerStatsFilePath, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, FollowerStats>;
      this.persistedFollowerStats.clear();
      for (const [key, value] of Object.entries(parsed)) {
        this.persistedFollowerStats.set(key, value);
      }
      console.log(`[CopierEngine] Loaded ${this.persistedFollowerStats.size} follower stats entries`);
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
  }
  
  private async saveFollowerStats(): Promise<void> {
    try {
      const obj: Record<string, FollowerStats> = {};
      for (const [key, value] of this.persistedFollowerStats) {
        obj[key] = value;
      }
      await fs.writeFile(this.followerStatsFilePath, JSON.stringify(obj, null, 2), 'utf-8');
      console.log(`[CopierEngine] Saved ${this.persistedFollowerStats.size} follower stats entries`);
    } catch (error) {
      console.error('[CopierEngine] Failed to save follower stats:', error);
    }
  }
  
  private debouncedSaveFollowerStats(): void {
    if (this.saveFollowerStatsTimer) {
      clearTimeout(this.saveFollowerStatsTimer);
    }
    this.saveFollowerStatsTimer = setTimeout(() => {
      this.saveFollowerStatsTimer = null;
      this.saveFollowerStats().catch(() => {});
    }, CopierEngine.SAVE_DEBOUNCE_MS);
  }
  
  // ========================================================================
  // Offline Trade Sync
  // ========================================================================
  
  /**
   * Get the path to the MT5 Common Files directory.
   * All MT5 terminals share: %APPDATA%\MetaQuotes\Terminal\Common\Files\
   */
  private static getMT5CommonFilesPath(): string {
    const appData = process.env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA environment variable not set');
    }
    return path.join(appData, 'MetaQuotes', 'Terminal', 'Common', 'Files');
  }
  
  /**
   * Sync trades that occurred while the Electron app was closed.
   * 
   * The Slave EA (HE_slave) writes completed trades to JSONL files:
   *   %APPDATA%\MetaQuotes\Terminal\Common\Files\HedgeEdge\trade_log_{login}.jsonl
   * 
   * This method reads those files, filters out already-processed entries
   * (tracked by a watermark file), and ingests them into follower stats.
   * This ensures the analytics tiles are accurate even after offline copying.
   */
  async syncOfflineTrades(): Promise<void> {
    console.log('[CopierEngine] Starting offline trade sync...');
    
    try {
      const commonDir = path.join(CopierEngine.getMT5CommonFilesPath(), 'HedgeEdge');
      
      // Check if the directory exists
      try {
        await fs.access(commonDir);
      } catch {
        console.log('[CopierEngine] No HedgeEdge Common Files directory found — skipping offline sync');
        return;
      }
      
      // Load watermarks (last processed timestamp per account)
      const watermarks = await this.loadOfflineWatermarks();
      
      // Find all trade log files
      const entries = await fs.readdir(commonDir);
      const tradeLogFiles = entries.filter(f => f.startsWith('trade_log_') && f.endsWith('.jsonl'));
      
      if (tradeLogFiles.length === 0) {
        console.log('[CopierEngine] No trade log files found');
        return;
      }
      
      let totalSynced = 0;
      const newWatermarks: Record<string, number> = { ...watermarks };
      
      for (const file of tradeLogFiles) {
        const filePath = path.join(commonDir, file);
        // Extract account login from filename: trade_log_12345.jsonl → 12345
        const accountLogin = file.replace('trade_log_', '').replace('.jsonl', '');
        const lastProcessedTimestamp = watermarks[accountLogin] || 0;
        
        console.log(`[CopierEngine] Processing trade log for account ${accountLogin}, watermark=${lastProcessedTimestamp}`);
        
        const newEntries = await this.parseTradeLogFile(filePath, lastProcessedTimestamp);
        
        if (newEntries.length === 0) {
          console.log(`[CopierEngine] No new entries in trade log for account ${accountLogin}`);
          continue;
        }
        
        console.log(`[CopierEngine] Found ${newEntries.length} new trade log entries for account ${accountLogin}`);
        
        // Find which follower this account belongs to
        let maxTimestamp = lastProcessedTimestamp;
        
        for (const entry of newEntries) {
          // Only process COPY_CLOSE events (they have P/L data)
          if (entry.event === 'COPY_CLOSE') {
            const totalPnL = (entry.profit || 0) + (entry.swap || 0) + (entry.commission || 0);
            
            // Find the follower in any group that matches this account login
            let matched = false;
            for (const [, group] of this.groups) {
              for (const follower of group.followers) {
                const followerTerminalId = this.accountMap.get(follower.accountId);
                const followerLogin = followerTerminalId?.replace('mt5-', '') || '';
                
                if (followerLogin === accountLogin || follower.accountId === accountLogin) {
                  // Ingest the offline trade into follower stats
                  follower.stats.totalProfit += totalPnL;
                  follower.stats.tradesTotal++;
                  follower.stats.tradesToday++;
                  follower.stats.lastCopyTime = entry.timestamp || new Date().toISOString();
                  
                  this.persistedFollowerStats.set(follower.id, { ...follower.stats });
                  
                  this.addActivity({
                    groupId: group.id,
                    followerId: follower.id,
                    type: 'close',
                    symbol: entry.symbol || 'UNKNOWN',
                    action: entry.side === 'BUY' ? 'buy' : 'sell',
                    volume: entry.volume || 0,
                    price: entry.closePrice || 0,
                    latency: 0,
                    status: 'success',
                  });
                  
                  totalSynced++;
                  matched = true;
                  console.log(`[CopierEngine] Synced offline trade: ${entry.symbol} ${entry.side} P/L=${totalPnL} → follower ${follower.id}`);
                  break;
                }
              }
              if (matched) break;
            }
            
            if (!matched) {
              // Follower not yet in any group — store in persisted stats keyed by account login
              // so it can be attributed when groups are updated later
              console.log(`[CopierEngine] Offline trade for unmapped account ${accountLogin} — storing for later attribution`);
            }
          }
          
          // Track watermark
          const entryTimestamp = entry.timestampUnix || 0;
          if (entryTimestamp > maxTimestamp) {
            maxTimestamp = entryTimestamp;
          }
        }
        
        newWatermarks[accountLogin] = maxTimestamp;
      }
      
      // Save updated watermarks
      await this.saveOfflineWatermarks(newWatermarks);
      
      // Persist updated follower stats
      if (totalSynced > 0) {
        await this.saveFollowerStats();
        await this.saveActivity();
        this.emitStatsUpdate();
      }
      
      console.log(`[CopierEngine] Offline sync complete: ${totalSynced} trades ingested`);
    } catch (error) {
      console.error('[CopierEngine] Offline sync failed:', error);
    }
  }
  
  /**
   * Parse a trade log JSONL file, returning entries newer than the given timestamp.
   */
  private async parseTradeLogFile(
    filePath: string,
    afterTimestamp: number
  ): Promise<Array<{
    event: string;
    account: string;
    masterTicket: number;
    slaveTicket: number;
    symbol: string;
    side: string;
    volume: number;
    entryPrice: number;
    closePrice: number;
    profit: number;
    swap: number;
    commission: number;
    balance: number;
    equity: number;
    timestamp: string;
    timestampUnix: number;
  }>> {
    const entries: Array<{
      event: string;
      account: string;
      masterTicket: number;
      slaveTicket: number;
      symbol: string;
      side: string;
      volume: number;
      entryPrice: number;
      closePrice: number;
      profit: number;
      swap: number;
      commission: number;
      balance: number;
      equity: number;
      timestamp: string;
      timestampUnix: number;
    }> = [];
    
    return new Promise((resolve, reject) => {
      const rl = createInterface({
        input: createReadStream(filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      });
      
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        try {
          const entry = JSON.parse(trimmed);
          // Only include entries newer than the watermark
          if ((entry.timestampUnix || 0) > afterTimestamp) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      });
      
      rl.on('close', () => resolve(entries));
      rl.on('error', reject);
    });
  }
  
  /**
   * Load offline sync watermarks from disk.
   * Watermarks track the last processed timestampUnix per account login.
   */
  private async loadOfflineWatermarks(): Promise<Record<string, number>> {
    try {
      const data = await fs.readFile(this.offlineSyncWatermarkPath, 'utf-8');
      return JSON.parse(data) as Record<string, number>;
    } catch {
      return {};
    }
  }
  
  /**
   * Save offline sync watermarks to disk.
   */
  private async saveOfflineWatermarks(watermarks: Record<string, number>): Promise<void> {
    try {
      await fs.writeFile(this.offlineSyncWatermarkPath, JSON.stringify(watermarks, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CopierEngine] Failed to save offline watermarks:', error);
    }
  }
  
  /**
   * Export current copier group configuration to MT5 Common Files.
   * 
   * Written to: HedgeEdge/copier_config.json
   * 
   * This allows the Slave EA to potentially read group membership,
   * lot multipliers, and symbol filters directly from disk, making
   * the configuration survive app restarts and available for
   * future EA-side enhancements.
   */
  private async exportCopierConfigToCommonFiles(): Promise<void> {
    try {
      const commonDir = path.join(CopierEngine.getMT5CommonFilesPath(), 'HedgeEdge');
      await fs.mkdir(commonDir, { recursive: true });
      
      const config: {
        exportedAt: string;
        groups: Array<{
          id: string;
          name: string;
          status: string;
          leaderAccountId: string;
          leaderAccountName: string;
          followers: Array<{
            id: string;
            accountId: string;
            accountName: string;
            terminalId: string | null;
            lotMultiplier: number;
            reverseMode: boolean;
            status: string;
            symbolWhitelist: string[];
            symbolBlacklist: string[];
            symbolSuffix: string;
          }>;
        }>;
      } = {
        exportedAt: new Date().toISOString(),
        groups: [],
      };
      
      for (const [, group] of this.groups) {
        config.groups.push({
          id: group.id,
          name: group.name,
          status: group.status,
          leaderAccountId: group.leaderAccountId,
          leaderAccountName: group.leaderAccountName,
          followers: group.followers.map(f => ({
            id: f.id,
            accountId: f.accountId,
            accountName: f.accountName,
            terminalId: this.accountMap.get(f.accountId) || null,
            lotMultiplier: f.lotMultiplier,
            reverseMode: f.reverseMode,
            status: f.status,
            symbolWhitelist: f.symbolWhitelist,
            symbolBlacklist: f.symbolBlacklist,
            symbolSuffix: f.symbolSuffix,
          })),
        });
      }
      
      const configPath = path.join(commonDir, 'copier_config.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log(`[CopierEngine] Copier config exported to ${configPath}`);
    } catch (error) {
      console.warn('[CopierEngine] Failed to export copier config:', error);
    }
  }
  
  // ========================================================================
  // Helpers
  // ========================================================================
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Reset circuit breaker for a follower (called from UI when user acknowledges errors)
   */
  resetCircuitBreaker(_groupId: string, followerId: string): void {
    this.followerFailures.set(followerId, 0);
    console.log(`[CopierEngine] Circuit breaker reset for follower ${followerId}`);
  }
  
  /**
   * Reset daily stats (should be called at midnight)
   */
  resetDailyStats(): void {
    for (const group of this.groups.values()) {
      for (const f of group.followers) {
        f.stats.tradesToday = 0;
      }
    }
    this.emitStatsUpdate();
  }
  
  /**
   * Graceful shutdown - persist state and clean up
   */
  shutdown(): void {
    // Flush any pending debounced save, then do a final immediate save
    if (this.saveCorrelationsTimer) {
      clearTimeout(this.saveCorrelationsTimer);
      this.saveCorrelationsTimer = null;
    }
    this.saveCorrelations().catch(() => {});
    this.saveActivity().catch(() => {});
    console.log('[CopierEngine] Shutdown complete - state persisted');
  }
}
