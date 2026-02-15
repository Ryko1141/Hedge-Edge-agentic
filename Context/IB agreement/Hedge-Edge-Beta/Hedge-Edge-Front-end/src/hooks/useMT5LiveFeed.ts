/**
 * MT5 Live Feed Hook (Backwards Compatibility)
 * =============================================
 * This file re-exports from the new unified useTradingFeed hook
 * for backwards compatibility with existing code.
 * 
 * @deprecated Import from '@/hooks/useTradingFeed' directly
 */

// Re-export everything from the new unified hook
export {
  useTradingFeed as useMT5LiveFeed,
  useTerminalStatus,
  formatCurrency,
  formatPercent,
  formatLots,
  formatPrice,
  type MT5Snapshot,
  type MT5Position,
  type MT5Order,
  type MT5Tick,
  type UseTradingFeedReturn as UseMT5LiveFeedReturn,
  type UseTradingFeedOptions as UseMT5LiveFeedOptions,
} from './useTradingFeed';

// Default export for backwards compatibility
export { useTradingFeed as default } from './useTradingFeed';
