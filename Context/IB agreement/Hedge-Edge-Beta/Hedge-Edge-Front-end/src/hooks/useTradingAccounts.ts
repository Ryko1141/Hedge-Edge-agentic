import { useState, useEffect } from 'react';
import { supabase, isSupabaseEnabled } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface TradingAccount {
  id: string;
  user_id: string;
  account_name: string;
  prop_firm: string | null;
  account_size: number;
  current_balance: number;
  phase: 'evaluation' | 'funded' | 'live';
  platform: string | null;
  server: string | null;
  login?: string | null;
  metaapi_account_id?: string | null;
  profit_target: number | null;
  max_loss: number | null;
  max_daily_loss: number | null;
  min_trading_days: number | null;
  trading_days_completed: number | null;
  pnl: number;
  pnl_percent: number;
  is_active: boolean;
  is_archived: boolean;
  evaluation_fee?: number | null;
  evaluation_phase?: number | null; // 1, 2, 3, or 4
  previous_account_id?: string | null; // Link to archived account for progression tracking
  /** Hedge P/L at time of archival — used to compute cumulative costs for subsequent phases */
  archived_hedge_pnl?: number | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAccountData {
  account_name: string;
  prop_firm?: string;
  account_size?: number;
  current_balance?: number;
  phase: 'evaluation' | 'funded' | 'live';
  platform?: string;
  server?: string;
  login?: string;
  metaapi_account_id?: string;
  profit_target?: number;
  max_loss?: number;
  max_daily_loss?: number;
  min_trading_days?: number;
  evaluation_fee?: number;
  evaluation_phase?: number;
  previous_account_id?: string;
  archived_hedge_pnl?: number;
}

// Local storage key for demo accounts
const LOCAL_ACCOUNTS_KEY = 'hedge_edge_demo_accounts';

const getLocalAccounts = (): TradingAccount[] => {
  try {
    const stored = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveLocalAccounts = (accounts: TradingAccount[]) => {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
};

// Custom event name used to sync all useTradingAccounts instances in the same tab
const ACCOUNTS_CHANGED_EVENT = 'hedge_edge_accounts_changed';

/** Notify other hook instances that accounts have been mutated */
const dispatchAccountsChanged = () => {
  window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT));
};

export const useTradingAccounts = () => {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchAccounts = async () => {
    setLoading(true);
    
    // If user is authenticated and Supabase is enabled, try Supabase first
    if (user && isSupabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('trading_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setAccounts(data as TradingAccount[]);
        setLoading(false);
        return;
      }
    }
    
    // Fallback to local storage for demo mode
    const localAccounts = getLocalAccounts();
    setAccounts(localAccounts);
    setLoading(false);
  };

  const createAccount = async (data: CreateAccountData) => {
    // If user is authenticated and Supabase is enabled, use Supabase
    if (user && isSupabaseEnabled && supabase) {
      // Strip login field - not in Supabase schema, only for demo mode
      const { login, ...supabaseData } = data;
      const { error } = await supabase
        .from('trading_accounts')
        .insert({
          ...supabaseData,
          user_id: user.id,
          current_balance: data.current_balance ?? data.account_size ?? 0,
        });

      if (error) {
        toast({
          title: 'Error creating account ❌',
          description: error.message,
          variant: 'destructive',
        });
        return { error };
      }
    } else {
      // Demo mode - use local storage
      const newAccount: TradingAccount = {
        id: crypto.randomUUID(),
        user_id: 'demo',
        account_name: data.account_name,
        prop_firm: data.prop_firm || null,
        account_size: data.account_size || 0,
        current_balance: data.current_balance ?? data.account_size ?? 0,
        phase: data.phase,
        platform: data.platform || null,
        server: data.server || null,
        login: data.login || null,
        metaapi_account_id: data.metaapi_account_id || null,
        profit_target: data.profit_target || null,
        max_loss: data.max_loss || null,
        max_daily_loss: data.max_daily_loss || null,
        min_trading_days: data.min_trading_days || null,
        trading_days_completed: 0,
        pnl: 0,
        pnl_percent: 0,
        is_active: true,
        is_archived: false,
        evaluation_fee: data.evaluation_fee || null,
        evaluation_phase: data.evaluation_phase || null,
        previous_account_id: data.previous_account_id || null,
        archived_hedge_pnl: null,
        last_sync_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const localAccounts = getLocalAccounts();
      const updated = [newAccount, ...localAccounts];
      saveLocalAccounts(updated);
    }

    toast({
      title: 'Account created 🎉',
      description: 'Your trading account has been added.',
    });
    
    await fetchAccounts();
    dispatchAccountsChanged();
    return { error: null };
  };

  const updateAccount = async (id: string, data: Partial<CreateAccountData>) => {
    if (user && isSupabaseEnabled && supabase) {
      const { error } = await supabase
        .from('trading_accounts')
        .update(data)
        .eq('id', id);

      if (error) {
        toast({
          title: 'Error updating account ❌',
          description: error.message,
          variant: 'destructive',
        });
        return { error };
      }
    } else {
      // Demo mode
      const localAccounts = getLocalAccounts();
      const updated = localAccounts.map(acc => 
        acc.id === id ? { ...acc, ...data, updated_at: new Date().toISOString() } : acc
      );
      saveLocalAccounts(updated);
    }

    toast({
      title: 'Account updated ✅',
      description: 'Your trading account has been updated.',
    });
    
    await fetchAccounts();
    dispatchAccountsChanged();
    return { error: null };
  };

  /**
   * Sync account balance from MT5 data (silent update, no toast)
   */
  const syncAccountFromMT5 = async (id: string, mt5Data: { 
    balance: number; 
    equity: number; 
    profit: number;
  }) => {
    const account = accounts.find(a => a.id === id);
    if (!account) return;

    const accountSize = Number(account.account_size) || 0;
    const newBalance = mt5Data.balance;
    const pnl = newBalance - accountSize;
    const pnlPercent = accountSize > 0 ? (pnl / accountSize) * 100 : 0;

    if (user && isSupabaseEnabled && supabase) {
      await supabase
        .from('trading_accounts')
        .update({
          current_balance: newBalance,
          pnl: pnl,
          pnl_percent: pnlPercent,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', id);
    } else {
      // Demo mode
      const localAccounts = getLocalAccounts();
      const updated = localAccounts.map(acc => 
        acc.id === id ? { 
          ...acc, 
          current_balance: newBalance,
          pnl: pnl,
          pnl_percent: pnlPercent,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString() 
        } : acc
      );
      saveLocalAccounts(updated);
    }

    // Update local state without showing toast
    await fetchAccounts();
    dispatchAccountsChanged();
  };

  const archiveAccount = async (id: string, hedgePnL?: number) => {
    const archiveData: Record<string, unknown> = { is_archived: true, is_active: false };
    if (hedgePnL !== undefined) {
      archiveData.archived_hedge_pnl = hedgePnL;
    }
    if (user && isSupabaseEnabled && supabase) {
      const { error } = await supabase
        .from('trading_accounts')
        .update(archiveData)
        .eq('id', id);

      if (error) {
        toast({
          title: 'Error archiving account ❌',
          description: error.message,
          variant: 'destructive',
        });
        return { error };
      }
    } else {
      // Demo mode
      const localAccounts = getLocalAccounts();
      const updated = localAccounts.map(acc => 
        acc.id === id ? { ...acc, ...archiveData, updated_at: new Date().toISOString() } : acc
      );
      saveLocalAccounts(updated);
    }

    toast({
      title: 'Account archived 📦',
      description: 'Your trading account has been archived.',
    });
    
    await fetchAccounts();
    dispatchAccountsChanged();
    return { error: null };
  };

  const restoreAccount = async (id: string) => {
    if (user && isSupabaseEnabled && supabase) {
      const { error } = await supabase
        .from('trading_accounts')
        .update({ is_archived: false, is_active: true })
        .eq('id', id);

      if (error) {
        toast({
          title: 'Error restoring account ❌',
          description: error.message,
          variant: 'destructive',
        });
        return { error };
      }
    } else {
      // Demo mode
      const localAccounts = getLocalAccounts();
      const updated = localAccounts.map(acc => 
        acc.id === id ? { ...acc, is_archived: false, is_active: true, updated_at: new Date().toISOString() } : acc
      );
      saveLocalAccounts(updated);
    }

    toast({
      title: 'Account restored ✅',
      description: 'Your trading account has been restored.',
    });
    
    await fetchAccounts();
    dispatchAccountsChanged();
    return { error: null };
  };

  const deleteAccount = async (id: string) => {
    if (user && isSupabaseEnabled && supabase) {
      const { error } = await supabase
        .from('trading_accounts')
        .delete()
        .eq('id', id);

      if (error) {
        toast({
          title: 'Error deleting account ❌',
          description: error.message,
          variant: 'destructive',
        });
        return { error };
      }
    } else {
      // Demo mode
      const localAccounts = getLocalAccounts();
      const updated = localAccounts.filter(acc => acc.id !== id);
      saveLocalAccounts(updated);
    }

    toast({
      title: 'Account deleted 🗑️',
      description: 'Your trading account has been removed.',
    });
    
    await fetchAccounts();
    dispatchAccountsChanged();
    return { error: null };
  };

  useEffect(() => {
    fetchAccounts();
  }, [user]);

  // Listen for mutations from other hook instances and refetch
  useEffect(() => {
    const handleAccountsChanged = () => {
      fetchAccounts();
    };
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, handleAccountsChanged);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, handleAccountsChanged);
  }, [user]);

  return {
    accounts,
    loading,
    fetchAccounts,
    createAccount,
    updateAccount,
    archiveAccount,
    restoreAccount,
    deleteAccount,
    syncAccountFromMT5,
  };
};
