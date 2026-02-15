/**
 * Daily Limit Tracker
 * 
 * Tracks account balance at broker EOD (End of Day) and calculates dynamic daily limits
 * based on the NEW day's starting balance, not the initial account size.
 * 
 * Key features:
 * 1. Tracks day-start balance for each account based on broker server time
 * 2. Detects EOD transition and resets day-start balance
 * 3. During day crossover (trade in progress), uses max(equity, drawdown) for calculation
 * 4. Persists state to survive app restarts
 */

import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/**
 * Daily tracking state for a single account
 */
export interface DailyAccountState {
  /** Account ID (terminal login or Supabase UUID) */
  accountId: string;
  /** Balance at the start of the current trading day */
  dayStartBalance: number;
  /** Equity at the start of the current trading day */
  dayStartEquity: number;
  /** The broker server date when day-start was recorded (YYYY-MM-DD) */
  dayStartDate: string;
  /** Unix timestamp of the last EOD transition */
  lastEodTimestamp: number;
  /** High-water mark: max(equity, balance) during day crossover */
  crossoverHighWaterMark: number | null;
  /** Whether a position was open at day crossover */
  hadPositionAtCrossover: boolean;
}

/**
 * Real-time metrics from the EA
 */
export interface AccountMetrics {
  balance: number;
  equity: number;
  floatingPnL: number;
  positionCount: number;
  /** Broker server time as Unix timestamp */
  serverTimeUnix?: number;
  /** Broker server time as string (YYYY.MM.DD HH:MM:SS) */
  serverTime?: string;
}

/**
 * Daily limit calculation result
 */
export interface DailyLimitResult {
  /** The balance used as reference for daily limit calculation */
  referenceBalance: number;
  /** Daily limit as absolute value (negative = max loss allowed) */
  dailyLimitPnL: number;
  /** Daily limit as percentage */
  dailyLimitPercent: number;
  /** Current day's P&L relative to day-start */
  currentDayPnL: number;
  /** Current day's P&L as percentage of day-start balance */
  currentDayPnLPercent: number;
  /** Remaining daily drawdown before hitting limit */
  remainingDailyDrawdown: number;
  /** Whether daily limit has been breached */
  isLimitBreached: boolean;
  /** The date used for this calculation (broker time) */
  tradingDate: string;
}

// ============================================================================
// Constants
// ============================================================================

/** 
 * Default EOD hour in broker server time (00:00 = midnight)
 * Most brokers use 00:00 server time as EOD, but some use 17:00 NY time
 */
const DEFAULT_EOD_HOUR = 0;

/**
 * Tolerance in seconds for EOD detection (to handle slight timing variations)
 */
const EOD_TOLERANCE_SECONDS = 60;

// ============================================================================
// Daily Limit Tracker Class
// ============================================================================

export class DailyLimitTracker extends EventEmitter {
  private accountStates: Map<string, DailyAccountState> = new Map();
  private persistPath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SAVE_DEBOUNCE_MS = 5000;
  
  constructor() {
    super();
    const userDataPath = app.getPath('userData');
    this.persistPath = path.join(userDataPath, 'daily-limit-states.json');
  }
  
  // ========================================================================
  // Lifecycle
  // ========================================================================
  
  /**
   * Initialize the tracker and load persisted state
   */
  async initialize(): Promise<void> {
    await this.loadState();
    console.log('[DailyLimitTracker] Initialized with', this.accountStates.size, 'accounts');
  }
  
  /**
   * Shutdown and persist state
   */
  async shutdown(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveState();
    console.log('[DailyLimitTracker] Shutdown complete');
  }
  
  // ========================================================================
  // Core Logic
  // ========================================================================
  
  /**
   * Update account metrics and check for EOD transition
   * Call this whenever new metrics are received from the EA
   */
  updateMetrics(accountId: string, metrics: AccountMetrics): void {
    const state = this.accountStates.get(accountId);
    const brokerDate = this.getBrokerDate(metrics);
    
    if (!state) {
      // First time seeing this account - initialize with current values
      this.initializeAccount(accountId, metrics, brokerDate);
      return;
    }
    
    // Check if we've crossed into a new trading day
    if (brokerDate !== state.dayStartDate) {
      this.handleDayCrossover(accountId, state, metrics, brokerDate);
    }
  }
  
  /**
   * Calculate the daily limit for an account
   * 
   * @param accountId The account ID
   * @param maxDailyLossPercent The max daily loss percentage (e.g., 5 for 5%)
   * @param currentMetrics Current account metrics
   * @returns Daily limit calculation result
   */
  calculateDailyLimit(
    accountId: string,
    maxDailyLossPercent: number,
    currentMetrics: AccountMetrics
  ): DailyLimitResult {
    const state = this.accountStates.get(accountId);
    const brokerDate = this.getBrokerDate(currentMetrics);
    
    if (!state) {
      // No state yet - use current balance as reference
      return this.calculateWithReference(
        currentMetrics.balance,
        maxDailyLossPercent,
        currentMetrics,
        brokerDate
      );
    }
    
    // Determine the reference balance for daily limit calculation
    let referenceBalance: number;
    
    if (state.hadPositionAtCrossover && state.crossoverHighWaterMark !== null) {
      // Use the high-water mark from crossover (max of equity/balance at crossover)
      referenceBalance = state.crossoverHighWaterMark;
    } else {
      // Normal case: use day-start balance
      referenceBalance = state.dayStartBalance;
    }
    
    return this.calculateWithReference(
      referenceBalance,
      maxDailyLossPercent,
      currentMetrics,
      brokerDate
    );
  }
  
  /**
   * Get the current day-start state for an account
   */
  getAccountState(accountId: string): DailyAccountState | undefined {
    return this.accountStates.get(accountId);
  }
  
  /**
   * Manually reset the day-start balance (e.g., after funding change)
   */
  resetDayStart(accountId: string, metrics: AccountMetrics): void {
    const brokerDate = this.getBrokerDate(metrics);
    this.initializeAccount(accountId, metrics, brokerDate);
    console.log(`[DailyLimitTracker] Manual reset for ${accountId}, new day-start: ${metrics.balance}`);
  }
  
  /**
   * Get all tracked accounts
   */
  getAllAccountIds(): string[] {
    return Array.from(this.accountStates.keys());
  }
  
  // ========================================================================
  // Internal Helpers
  // ========================================================================
  
  /**
   * Extract broker date from metrics (YYYY-MM-DD format)
   */
  private getBrokerDate(metrics: AccountMetrics): string {
    if (metrics.serverTimeUnix) {
      // Use Unix timestamp - convert to date
      const date = new Date(metrics.serverTimeUnix * 1000);
      return date.toISOString().split('T')[0];
    }
    
    if (metrics.serverTime) {
      // Parse "YYYY.MM.DD HH:MM:SS" format from MT5
      const datePart = metrics.serverTime.split(' ')[0];
      return datePart.replace(/\./g, '-');
    }
    
    // Fallback to local date (not ideal, but better than nothing)
    return new Date().toISOString().split('T')[0];
  }
  
  /**
   * Initialize tracking for a new account
   */
  private initializeAccount(
    accountId: string,
    metrics: AccountMetrics,
    brokerDate: string
  ): void {
    const state: DailyAccountState = {
      accountId,
      dayStartBalance: metrics.balance,
      dayStartEquity: metrics.equity,
      dayStartDate: brokerDate,
      lastEodTimestamp: metrics.serverTimeUnix || Math.floor(Date.now() / 1000),
      crossoverHighWaterMark: null,
      hadPositionAtCrossover: false,
    };
    
    this.accountStates.set(accountId, state);
    this.scheduleSave();
    
    console.log(`[DailyLimitTracker] Initialized ${accountId}: dayStart=${metrics.balance}, date=${brokerDate}`);
    this.emit('dayStartUpdated', accountId, state);
  }
  
  /**
   * Handle the transition between trading days
   * 
   * If a position is open at crossover, we use the higher of:
   * - Current equity (accounts for unrealized profit/loss)
   * - Current balance (the realized balance)
   * 
   * This ensures that if you're up 5% at day-end, your new daily limit
   * is based on the higher balance, not the old one.
   */
  private handleDayCrossover(
    accountId: string,
    state: DailyAccountState,
    metrics: AccountMetrics,
    newDate: string
  ): void {
    const hasOpenPositions = metrics.positionCount > 0;
    
    // Calculate the high-water mark at crossover
    // Use max(equity, balance) to get the best reference point
    const highWaterMark = Math.max(metrics.equity, metrics.balance);
    
    // Update state for new day
    const updatedState: DailyAccountState = {
      accountId,
      dayStartBalance: hasOpenPositions ? highWaterMark : metrics.balance,
      dayStartEquity: metrics.equity,
      dayStartDate: newDate,
      lastEodTimestamp: metrics.serverTimeUnix || Math.floor(Date.now() / 1000),
      crossoverHighWaterMark: hasOpenPositions ? highWaterMark : null,
      hadPositionAtCrossover: hasOpenPositions,
    };
    
    this.accountStates.set(accountId, updatedState);
    this.scheduleSave();
    
    console.log(
      `[DailyLimitTracker] EOD transition for ${accountId}: ` +
      `${state.dayStartDate} → ${newDate}, ` +
      `newDayStart=${updatedState.dayStartBalance}, ` +
      `hadPositions=${hasOpenPositions}, ` +
      `highWaterMark=${highWaterMark}`
    );
    
    this.emit('eodTransition', accountId, updatedState);
  }
  
  /**
   * Calculate daily limit values given a reference balance
   */
  private calculateWithReference(
    referenceBalance: number,
    maxDailyLossPercent: number,
    currentMetrics: AccountMetrics,
    tradingDate: string
  ): DailyLimitResult {
    // Daily limit as absolute P&L value (negative = loss)
    const dailyLimitPnL = -(maxDailyLossPercent / 100) * referenceBalance;
    
    // Current P&L relative to day-start reference
    const currentDayPnL = currentMetrics.equity - referenceBalance;
    const currentDayPnLPercent = referenceBalance > 0 
      ? (currentDayPnL / referenceBalance) * 100 
      : 0;
    
    // Remaining drawdown before limit (negative values mean loss capacity)
    const remainingDailyDrawdown = currentDayPnL - dailyLimitPnL;
    
    // Check if limit is breached
    const isLimitBreached = currentDayPnL <= dailyLimitPnL;
    
    return {
      referenceBalance,
      dailyLimitPnL,
      dailyLimitPercent: maxDailyLossPercent,
      currentDayPnL,
      currentDayPnLPercent,
      remainingDailyDrawdown,
      isLimitBreached,
      tradingDate,
    };
  }
  
  // ========================================================================
  // Persistence
  // ========================================================================
  
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveState().catch(err => {
        console.error('[DailyLimitTracker] Failed to save state:', err);
      });
    }, DailyLimitTracker.SAVE_DEBOUNCE_MS);
  }
  
  private async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const states: DailyAccountState[] = JSON.parse(data);
      
      for (const state of states) {
        this.accountStates.set(state.accountId, state);
      }
      
      console.log(`[DailyLimitTracker] Loaded ${states.length} account states`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[DailyLimitTracker] Failed to load state:', error);
      }
      // File doesn't exist or error - start fresh
    }
  }
  
  private async saveState(): Promise<void> {
    const states = Array.from(this.accountStates.values());
    await fs.writeFile(this.persistPath, JSON.stringify(states, null, 2));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const dailyLimitTracker = new DailyLimitTracker();
