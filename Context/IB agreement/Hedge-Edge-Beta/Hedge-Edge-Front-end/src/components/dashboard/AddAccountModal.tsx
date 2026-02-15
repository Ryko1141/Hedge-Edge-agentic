import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { NumberInput } from '@/components/ui/number-input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, 
  TrendingUp, 
  CheckCircle2, 
  Monitor,
  ChevronRight,
  ChevronLeft,
  Play,
  RefreshCw,
  AlertCircle,
  Building2,
  Search,
  Radio,
  Wifi,
  WifiOff,
  User,
  DollarSign,
  Server,
  Archive,
  Link2
} from 'lucide-react';
import { CreateAccountData, TradingAccount } from '@/hooks/useTradingAccounts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { isElectron } from '@/lib/desktop';
import { PermissionsChecklist, CTraderGuidance } from './PermissionsChecklist';

// ============================================================================
// Types
// ============================================================================

type WizardStep = 'account-type' | 'platform' | 'terminal' | 'prop-firm' | 'hedge-pipeline' | 'prop-details' | 'listening';
type AccountPhase = 'evaluation' | 'funded' | 'live';
type Platform = 'MT4' | 'MT5' | 'cTrader';
type TerminalType = 'mt4' | 'mt5' | 'ctrader';

interface DetectedAccount {
  login: string;
  server: string;
  name?: string;
  broker?: string;
  balance?: number;
  equity?: number;
  currency?: string;
  leverage?: number;
}

interface DetectedTerminal {
  id: string;
  type: TerminalType;
  name: string;
  executablePath: string;
  installPath: string;
  broker?: string;
  version?: string;
  isRunning?: boolean;
  terminalId?: string;
  dataPath?: string;
}

interface DetectionResult {
  success: boolean;
  terminals: DetectedTerminal[];
  error?: string;
  deepScan?: boolean;
}

interface AddAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAccountData) => Promise<{ error: Error | null }>;
  defaultType?: 'hedge' | 'linked';
  hedgeAccounts?: TradingAccount[];
  existingAccounts?: TradingAccount[];
}

// ============================================================================
// Constants
// ============================================================================

export const PROP_FIRMS = [
  { name: 'Funding Pips', logo: 'https://www.google.com/s2/favicons?domain=fundingpips.com&sz=64' },
  { name: 'The5ers', logo: 'https://www.google.com/s2/favicons?domain=the5ers.com&sz=64' },
  { name: 'Alpha Capital', logo: 'https://www.google.com/s2/favicons?domain=alphacapitalgroup.uk&sz=64' },
  { name: 'Blueberry Funded', logo: 'https://www.google.com/s2/favicons?domain=blueberryfunded.com&sz=64' },
  { name: 'ThinkCapital', logo: 'https://www.google.com/s2/favicons?domain=thinkcapital.com&sz=64' },
  { name: 'ATFunded', logo: 'https://www.google.com/s2/favicons?domain=atfunded.com&sz=64' },
  { name: 'Hantec Trader', logo: 'https://www.google.com/s2/favicons?domain=htrader.com&sz=64' },
  { name: 'QT Funded', logo: 'https://www.google.com/s2/favicons?domain=qtfunded.com&sz=64' },
  { name: 'Blue Guardian', logo: 'https://www.google.com/s2/favicons?domain=blueguardian.com&sz=64' },
  { name: 'BrightFunded', logo: 'https://www.google.com/s2/favicons?domain=brightfunded.com&sz=64' },
  { name: 'AquaFunded', logo: 'https://www.google.com/s2/favicons?domain=aquafunded.com&sz=64' },
  { name: 'City Traders Imperium', logo: 'https://www.google.com/s2/favicons?domain=citytradersimperium.com&sz=64' },
  { name: 'Lark Funding', logo: 'https://www.google.com/s2/favicons?domain=larkfunding.com&sz=64' },
  { name: 'Audacity Capital', logo: 'https://www.google.com/s2/favicons?domain=audacitycapital.co.uk&sz=64' },
  { name: 'Funded Trading Plus', logo: 'https://www.google.com/s2/favicons?domain=fundedtradingplus.com&sz=64' },
  { name: 'Alpha Futures', logo: 'https://www.google.com/s2/favicons?domain=alpha-futures.com&sz=64' },
  { name: 'E8 Markets', logo: 'https://www.google.com/s2/favicons?domain=e8markets.com&sz=64' },
  { name: 'FundedNext', logo: 'https://www.google.com/s2/favicons?domain=fundednext.com&sz=64' },
  { name: 'Goat Funded Trader', logo: 'https://www.google.com/s2/favicons?domain=goatfundedtrader.com&sz=64' },
  { name: 'Top One Trader', logo: 'https://www.google.com/s2/favicons?domain=toponetrader.com&sz=64' },
  { name: 'Blueberry Futures', logo: 'https://www.google.com/s2/favicons?domain=blueberryfutures.com&sz=64' },
  { name: 'For Traders', logo: 'https://www.google.com/s2/favicons?domain=fortraders.com&sz=64' },
  { name: 'E8 Futures', logo: 'https://www.google.com/s2/favicons?domain=e8markets.com&sz=64' },
  { name: 'Funded Elite', logo: 'https://www.google.com/s2/favicons?domain=fundedelite.com&sz=64' },
  { name: 'Futures Elite', logo: 'https://www.google.com/s2/favicons?domain=futureselite.com&sz=64' },
  { name: 'FTMO', logo: 'https://www.google.com/s2/favicons?domain=ftmo.com&sz=64' },
  { name: 'FundedElite', logo: 'https://www.google.com/s2/favicons?domain=fundedelite.com&sz=64' },
  { name: 'OANDA Prop Trader', logo: 'https://www.google.com/s2/favicons?domain=oanda.com&sz=64' },
  { name: 'Seacrest Markets', logo: 'https://www.google.com/s2/favicons?domain=seacrestmarkets.io&sz=64' },
  { name: 'Fintokei', logo: 'https://www.google.com/s2/favicons?domain=fintokei.com&sz=64' },
  { name: 'Finotive Funding', logo: 'https://www.google.com/s2/favicons?domain=finotivefunding.com&sz=64' },
  { name: 'Crypto Fund Trader', logo: 'https://www.google.com/s2/favicons?domain=cryptofundtrader.com&sz=64' },
  { name: 'Nordic Funder', logo: 'https://www.google.com/s2/favicons?domain=nordicfunder.com&sz=64' },
  { name: 'FXIFY', logo: 'https://www.google.com/s2/favicons?domain=fxify.com&sz=64' },
  { name: 'Axi Select', logo: 'https://www.google.com/s2/favicons?domain=axi.com&sz=64' },
];

const ACCOUNT_SIZES = [
  { label: '$5k', value: 5000 },
  { label: '$10k', value: 10000 },
  { label: '$25k', value: 25000 },
  { label: '$50k', value: 50000 },
  { label: '$100k', value: 100000 },
  { label: '$150k', value: 150000 },
  { label: '$200k', value: 200000 },
  { label: '$250k', value: 250000 },
  { label: '$500k', value: 500000 },
  { label: '$1M', value: 1000000 },
  { label: '$2M', value: 2000000 },
];

// Platform logos - using Google's favicon service for reliability
export const PLATFORMS: { id: string; name: string; logo: string; color: string }[] = [
  { 
    id: 'MT4', 
    name: 'MetaTrader 4', 
    logo: 'https://www.google.com/s2/favicons?domain=metatrader4.com&sz=64',
    color: 'hover:border-blue-500/50 hover:bg-blue-500/5' 
  },
  { 
    id: 'MT5', 
    name: 'MetaTrader 5', 
    logo: 'https://www.google.com/s2/favicons?domain=metatrader5.com&sz=64',
    color: 'hover:border-indigo-500/50 hover:bg-indigo-500/5' 
  },
  { 
    id: 'cTrader', 
    name: 'cTrader', 
    logo: 'https://www.google.com/s2/favicons?domain=ctrader.com&sz=64',
    color: 'hover:border-cyan-500/50 hover:bg-cyan-500/5' 
  },
];

const PLATFORMS_INTERNAL: { id: Platform; name: string; logo: string; color: string }[] = [
  { 
    id: 'MT4', 
    name: 'MetaTrader 4', 
    logo: 'https://www.google.com/s2/favicons?domain=metatrader4.com&sz=64',
    color: 'hover:border-blue-500/50 hover:bg-blue-500/5' 
  },
  { 
    id: 'MT5', 
    name: 'MetaTrader 5', 
    logo: 'https://www.google.com/s2/favicons?domain=metatrader5.com&sz=64',
    color: 'hover:border-indigo-500/50 hover:bg-indigo-500/5' 
  },
  { 
    id: 'cTrader', 
    name: 'cTrader', 
    logo: 'https://www.google.com/s2/favicons?domain=ctrader.com&sz=64',
    color: 'hover:border-cyan-500/50 hover:bg-cyan-500/5' 
  },
];

const ACCOUNT_TYPES = [
  {
    phase: 'live' as const,
    title: 'Hedge Account',
    description: 'Personal account for hedging prop trades',
    color: 'hover:border-blue-500/50 hover:bg-blue-500/5',
    activeColor: 'border-blue-500/50 bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  {
    phase: 'evaluation' as const,
    title: 'Evaluation',
    description: 'Challenge or evaluation phase account',
    color: 'hover:border-yellow-500/50 hover:bg-yellow-500/5',
    activeColor: 'border-yellow-500/50 bg-yellow-500/10',
    iconColor: 'text-yellow-500',
  },
  {
    phase: 'funded' as const,
    title: 'Funded',
    description: 'Passed challenge, now funded',
    color: 'hover:border-emerald-500/50 hover:bg-emerald-500/5',
    activeColor: 'border-emerald-500/50 bg-emerald-500/10',
    iconColor: 'text-emerald-500',
  },
];

// ============================================================================
// Main Component
// ============================================================================

export const AddAccountModal = ({ 
  open, 
  onOpenChange, 
  onSubmit, 
  defaultType, 
  hedgeAccounts = [],
  existingAccounts = [] 
}: AddAccountModalProps) => {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('account-type');
  const [loading, setLoading] = useState(false);
  
  // Form data
  const [accountPhase, setAccountPhase] = useState<AccountPhase>('evaluation');
  const [platform, setPlatform] = useState<Platform>('MT5');
  const [selectedTerminal, setSelectedTerminal] = useState<DetectedTerminal | null>(null);
  const [formData, setFormData] = useState({
    account_name: '',
    prop_firm: '',
    account_size: 0,
    profit_target: 10,
    max_loss: 10,
    max_daily_loss: 5,
    min_trading_days: 4,
    evaluation_fee: 0,
    evaluation_phase: 1,
    previous_account_id: '',
  });
  const [propFirmSearch, setPropFirmSearch] = useState('');
  
  // Terminal detection state
  const [terminals, setTerminals] = useState<DetectedTerminal[]>([]);
  const [detectingTerminals, setDetectingTerminals] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);

  // Listening state for EA/cBot connections
  const [isListening, setIsListening] = useState(false);
  const [detectedAccounts, setDetectedAccounts] = useState<DetectedAccount[]>([]);
  const [selectedDetectedAccount, setSelectedDetectedAccount] = useState<DetectedAccount | null>(null);
  const listeningIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset everything when modal closes
  useEffect(() => {
    if (!open) {
      // Stop listening when modal closes
      if (listeningIntervalRef.current) {
        clearInterval(listeningIntervalRef.current);
        listeningIntervalRef.current = null;
      }
      setStep('account-type');
      setAccountPhase('evaluation');
      setPlatform('MT5');
      setSelectedTerminal(null);
      setFormData({
        account_name: '',
        prop_firm: '',
        account_size: 0,
        profit_target: 10,
        max_loss: 10,
        max_daily_loss: 5,
        min_trading_days: 4,
        evaluation_fee: 0,
        evaluation_phase: 1,
        previous_account_id: '',
      });
      setPropFirmSearch('');
      setTerminals([]);
      setTerminalError(null);
      setIsListening(false);
      setDetectedAccounts([]);
      setSelectedDetectedAccount(null);
    } else {
      // Handle defaultType when modal opens
      if (defaultType === 'hedge') {
        setAccountPhase('live');
        setStep('platform');
      } else if (defaultType === 'linked') {
        setAccountPhase('evaluation');
        setStep('account-type');
      }
    }
  }, [open, defaultType]);

  // Start listening for account connections when entering listening step
  useEffect(() => {
    console.log('[AddAccountModal] useEffect triggered, step:', step, 'isListening:', isListening);
    
    if (step === 'listening') {
      console.log('[AddAccountModal] Setting up polling interval...');
      
      // Clear any existing interval first
      if (listeningIntervalRef.current) {
        clearInterval(listeningIntervalRef.current);
      }
      
      // Set up new polling interval
      listeningIntervalRef.current = setInterval(async () => {
        console.log('[AddAccountModal] Polling tick - checking for accounts...');
        
        if (typeof window !== 'undefined' && window.electronAPI?.agent?.getConnectedAccounts) {
          try {
            const result = await window.electronAPI.agent.getConnectedAccounts();
            console.log('[AddAccountModal] Got result:', result);
            
            if (result.success && result.data && result.data.length > 0) {
              console.log('[AddAccountModal] Found accounts:', result.data);
              setDetectedAccounts(prev => {
                const existing = new Set(prev.map(a => `${a.login}@${a.server}`));
                const newAccounts = result.data!.filter(
                  (a) => !existing.has(`${a.login}@${a.server}`)
                );
                if (newAccounts.length > 0) {
                  toast.success('Account detected!', {
                    description: `Found ${newAccounts[0].broker || 'trading'} account`,
                  });
                }
                return [...prev, ...newAccounts.map(a => ({
                  login: a.login,
                  server: a.server,
                  name: a.name,
                  broker: a.broker,
                  balance: a.balance,
                  equity: a.equity,
                  currency: a.currency,
                  leverage: a.leverage,
                }))];
              });
            }
          } catch (err) {
            console.error('[AddAccountModal] Error polling:', err);
          }
        } else {
          console.log('[AddAccountModal] electronAPI not available');
        }
      }, 2000);
      
      console.log('[AddAccountModal] Interval started:', listeningIntervalRef.current);
      setIsListening(true);
    }
    
    return () => {
      console.log('[AddAccountModal] Cleanup running, clearing interval');
      if (listeningIntervalRef.current) {
        clearInterval(listeningIntervalRef.current);
        listeningIntervalRef.current = null;
      }
    };
  }, [step]);

  // Start listening for EA/cBot connections - DISABLED, moved to useEffect above
  const startListening = useCallback(() => {
    console.log('[AddAccountModal] startListening called (legacy)');
    // Now handled by useEffect
  }, []);

  // Detect terminals
  const detectTerminals = useCallback(async () => {
    console.log('[AddAccountModal] detectTerminals called');
    console.log('[AddAccountModal] window.electronAPI:', typeof window.electronAPI, window.electronAPI);
    console.log('[AddAccountModal] isElectron():', isElectron());
    console.log('[AddAccountModal] electronAPI?.isElectron:', window.electronAPI?.isElectron);
    console.log('[AddAccountModal] electronAPI?.terminals:', window.electronAPI?.terminals);
    
    if (!isElectron()) {
      setTerminalError('Terminal detection only available in desktop mode');
      return;
    }

    setDetectingTerminals(true);
    setTerminalError(null);

    try {
      const result: DetectionResult = await window.electronAPI!.terminals.detect();
      
      if (result.success) {
        const filterType = platform.toLowerCase() as TerminalType;
        const filtered = result.terminals.filter(t => t.type === filterType);
        setTerminals(filtered);
        
        if (filtered.length === 0) {
          setTerminalError(`No ${platform} installations found`);
        }
      } else {
        setTerminalError(result.error || 'Detection failed');
      }
    } catch (err) {
      setTerminalError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setDetectingTerminals(false);
    }
  }, [platform]);

  // Launch terminal
  const handleLaunchTerminal = async (terminal: DetectedTerminal) => {
    if (!isElectron()) return;
    setLaunching(terminal.id);

    try {
      const result = await window.electronAPI!.terminals.launch(terminal.executablePath);
      if (result.success) {
        toast.success('Terminal launched', { description: `Starting ${terminal.name}...` });
        // Re-detect after delay to update running status
        setTimeout(() => detectTerminals(), 2000);
      } else {
        toast.error('Failed to launch', { description: result.error });
      }
    } catch (err) {
      toast.error('Launch error', { description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setLaunching(null);
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    setLoading(true);
    
    const isEvaluationOrFunded = accountPhase === 'evaluation' || accountPhase === 'funded';
    
    const data: CreateAccountData = {
      account_name: formData.account_name,
      prop_firm: formData.prop_firm || undefined,
      account_size: formData.account_size || undefined,
      phase: accountPhase,
      platform: platform,
      ...(isEvaluationOrFunded && {
        profit_target: formData.profit_target,
        max_loss: formData.max_loss,
        max_daily_loss: formData.max_daily_loss,
        min_trading_days: formData.min_trading_days,
        // Progression fields
        evaluation_fee: formData.evaluation_fee || undefined,
        evaluation_phase: formData.evaluation_phase || undefined,
        previous_account_id: formData.previous_account_id || undefined,
      }),
      // Add detected account details if available
      ...(selectedDetectedAccount && {
        login: selectedDetectedAccount.login,
        server: selectedDetectedAccount.server,
        current_balance: selectedDetectedAccount.balance,
      }),
    };
    
    const { error } = await onSubmit(data);
    setLoading(false);
    
    if (!error) {
      toast.success('Account added!', {
        description: selectedDetectedAccount 
          ? `Connected to ${selectedDetectedAccount.broker || 'broker'} • Balance: ${selectedDetectedAccount.currency || '$'} ${selectedDetectedAccount.balance?.toLocaleString() || '—'}`
          : 'Waiting for Expert Advisor connection',
      });
      onOpenChange(false);
    }
  };

  // Handle finalizing with detected account
  const handleFinalizeWithAccount = async (account: DetectedAccount) => {
    setSelectedDetectedAccount(account);
    setLoading(true);
    
    const isEvaluationOrFunded = accountPhase === 'evaluation' || accountPhase === 'funded';
    
    const data: CreateAccountData = {
      account_name: formData.account_name || `${account.broker} ${accountPhase === 'live' ? 'Hedge' : accountPhase}`,
      prop_firm: formData.prop_firm || undefined,
      account_size: formData.account_size || account.balance,
      phase: accountPhase,
      platform: platform,
      login: account.login,
      server: account.server,
      current_balance: account.balance,
      ...(isEvaluationOrFunded && {
        profit_target: formData.profit_target,
        max_loss: formData.max_loss,
        max_daily_loss: formData.max_daily_loss,
        min_trading_days: formData.min_trading_days,
        // Progression fields
        evaluation_fee: formData.evaluation_fee || undefined,
        evaluation_phase: accountPhase === 'evaluation' ? formData.evaluation_phase : undefined,
        previous_account_id: formData.previous_account_id || undefined,
      }),
    };
    
    const { error } = await onSubmit(data);
    setLoading(false);
    
    if (!error) {
      toast.success('Account connected!', {
        description: `${account.broker || 'Trading Account'} • ${account.currency || '$'} ${account.balance?.toLocaleString() || '—'}`,
      });
      onOpenChange(false);
    }
  };

  // Step navigation helpers
  const getStepTitle = () => {
    switch (step) {
      case 'account-type': return 'Select Account Type';
      case 'platform': return 'Select Platform';
      case 'terminal': return platform === 'cTrader' ? 'cTrader Setup' : `Select ${platform} Installation`;
      case 'prop-firm': return 'Select Prop Firm';
      case 'hedge-pipeline': return 'Hedge Pipeline';
      case 'prop-details': return 'Account Details';
      case 'listening': return 'Connect Account';
      default: return 'Add Account';
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case 'account-type': return 'Choose the type of trading account you want to add';
      case 'platform': return 'Select the trading platform for this account';
      case 'terminal': return platform === 'cTrader' ? 'Configure the cBot in your cTrader application' : 'Choose which terminal installation to use';
      case 'prop-firm': return 'Select the prop firm for this account';
      case 'hedge-pipeline': return 'Track your evaluation journey';
      case 'prop-details': return 'Provide additional account information';
      case 'listening': return 'Waiting for your trading platform to connect';
      default: return '';
    }
  };

  // ============================================================================
  // Render Functions
  // ============================================================================

  const renderAccountTypeStep = () => (
    <div className="space-y-3 py-2">
      {ACCOUNT_TYPES.map((type, index) => (
        <button
          key={type.phase}
          onClick={() => {
            setAccountPhase(type.phase);
            setStep('platform');
          }}
          className={cn(
            "w-full p-4 rounded-xl border border-border/50 transition-all text-left group",
            "hover:scale-[1.02] active:scale-[0.98]",
            type.color
          )}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center",
              "transition-transform group-hover:scale-110",
              type.iconColor
            )}>
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {type.title}
              </h3>
              <p className="text-sm text-muted-foreground">{type.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </button>
      ))}
    </div>
  );

  const renderPlatformStep = () => (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-3 gap-3">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setPlatform(p.id);
              setSelectedTerminal(null);
              setTerminals([]);
            }}
            className={cn(
              "p-4 rounded-xl border transition-all text-center",
              "hover:scale-[1.02] active:scale-[0.98]",
              platform === p.id
                ? "border-primary bg-primary/10"
                : "border-border/50 hover:border-primary/30 hover:bg-muted/30"
            )}
          >
            <img 
              src={p.logo} 
              alt={p.name}
              className="w-10 h-10 mx-auto mb-2 object-contain"
              onError={(e) => { e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234ade80"><rect width="24" height="24" rx="4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="10">' + p.id[0] + '</text></svg>'; }}
            />
            <p className="text-sm font-medium">{p.id}</p>
          </button>
        ))}
      </div>
    </div>
  );

  const renderTerminalStep = () => {
    // For cTrader, show setup instructions instead of terminal detection
    if (platform === 'cTrader') {
      return (
        <div className="space-y-4 py-2">
          <CTraderGuidance />
        </div>
      );
    }

    const filteredTerminals = terminals;
    const hasRunningTerminal = filteredTerminals.some(t => t.isRunning);

    return (
      <div className="space-y-4 py-2">
        {/* Loading state */}
        {detectingTerminals && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
            <p className="text-sm font-medium">Scanning for {platform} terminals...</p>
          </div>
        )}

        {/* Error state */}
        {!detectingTerminals && terminalError && filteredTerminals.length === 0 && (
          <div className="p-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
            <AlertCircle className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
            <p className="text-sm text-yellow-400 font-medium mb-2">{terminalError}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Make sure {platform} is installed on this computer.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => detectTerminals()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Terminal list */}
        {!detectingTerminals && filteredTerminals.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                {filteredTerminals.length} terminal{filteredTerminals.length !== 1 ? 's' : ''} found
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => detectTerminals()}
                className="h-7 px-2 text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>

            {/* Notice when no terminals running */}
            {!hasRunningTerminal && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Play className="h-4 w-4 shrink-0" />
                <span className="text-xs">Launch a terminal to let the Expert Advisor connect</span>
              </div>
            )}

            <div className="space-y-2 max-h-[280px] overflow-y-auto overflow-x-hidden">
              {filteredTerminals.map((terminal) => {
                const isSelected = selectedTerminal?.id === terminal.id;
                const isLaunching = launching === terminal.id;

                return (
                  <div
                    key={terminal.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTerminal(terminal)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTerminal(terminal); } }}
                    className={cn(
                      "w-full p-4 rounded-xl border transition-all text-left cursor-pointer",
                      "hover:bg-muted/30",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/30"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                        <img 
                          src={PLATFORMS.find(p => p.id.toLowerCase() === terminal.type)?.logo || ''}
                          alt={terminal.type}
                          className="w-6 h-6 object-contain"
                          onError={(e) => { 
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.classList.add('text-blue-400');
                          }}
                        />
                        <Monitor className="h-5 w-5 hidden" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate max-w-[180px]" title={terminal.installPath}>
                            {terminal.broker || terminal.name}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={terminal.installPath}>
                          {terminal.type.toUpperCase()}
                        </p>
                      </div>

                      <div className="shrink-0">
                        {terminal.isRunning ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled
                            className="h-7 px-3 text-xs bg-muted/50 border-muted-foreground/20 text-muted-foreground cursor-default"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1.5 text-emerald-400" />
                            Running
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLaunchTerminal(terminal);
                            }}
                            disabled={isLaunching}
                            className="h-7 px-3 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          >
                            {isLaunching ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                Opening...
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1.5" />
                                Launch
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Permissions Checklist for MT4/MT5 */}
            {selectedTerminal && (platform === 'MT4' || platform === 'MT5') && (
              <PermissionsChecklist platform={platform.toLowerCase() as 'mt4' | 'mt5'} className="mt-4" />
            )}
          </>
        )}
      </div>
    );
  };

  const renderPropFirmStep = () => {
    const filteredFirms = PROP_FIRMS.filter(firm =>
      firm.name.toLowerCase().includes(propFirmSearch.toLowerCase())
    );

    return (
      <div className="space-y-4 py-2 pb-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
          <Building2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium mb-1">Account details auto-detected</p>
            <p className="text-xs text-muted-foreground">
              The Expert Advisor on {platform} will automatically detect your login, server, and balance when you connect.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prop firms..."
            value={propFirmSearch}
            onChange={(e) => setPropFirmSearch(e.target.value)}
            className="pl-9 bg-muted/30 border-border/50"
          />
        </div>

        {/* Prop firm grid */}
        <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto overflow-x-hidden pr-1">
            {filteredFirms.map((firm) => {
              const isSelected = formData.prop_firm === firm.name;
              return (
                <button
                  key={firm.name}
                  type="button"
                  onClick={() => setFormData({ ...formData, prop_firm: firm.name })}
                  className={cn(
                    "p-3 rounded-xl border transition-all text-left",
                    "hover:bg-muted/30 hover:scale-[1.02] active:scale-[0.98]",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border/30"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                      <img 
                        src={firm.logo}
                        alt={firm.name}
                        className="w-5 h-5 object-contain"
                        referrerPolicy="no-referrer"
                        onError={(e) => { 
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <Building2 className="h-4 w-4 text-muted-foreground hidden" />
                    </div>
                    <span className="text-sm font-medium truncate flex-1">
                      {firm.name}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

        {filteredFirms.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No prop firms found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        )}

        {/* Selected firm display */}
        {formData.prop_firm && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
              <img 
                src={PROP_FIRMS.find(f => f.name === formData.prop_firm)?.logo || ''}
                alt={formData.prop_firm}
                className="w-6 h-6 object-contain"
                referrerPolicy="no-referrer"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{formData.prop_firm}</p>
              <p className="text-xs text-muted-foreground">Selected prop firm</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
    );
  };

  // Get archived accounts for linking
  const archivedAccounts = existingAccounts.filter(a => a.is_archived);

  const renderHedgePipelineStep = () => {
    const selectedArchivedAccount = archivedAccounts.find(a => a.id === formData.previous_account_id);
    const showArchivedMapping = formData.evaluation_phase >= 2;

    return (
      <div className="space-y-4 py-2">
        {/* Evaluation Phase Selection - Compact */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Select Phase</Label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((phase) => (
              <button
                key={phase}
                type="button"
                onClick={() => {
                  setFormData({ 
                    ...formData, 
                    evaluation_phase: phase,
                    previous_account_id: phase === 1 ? '' : formData.previous_account_id
                  });
                }}
                className={cn(
                  "p-2 rounded-lg border-2 transition-all",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  formData.evaluation_phase === phase
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 hover:border-primary/30"
                )}
              >
                <p className="text-sm font-bold text-center">{phase}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Archived Account Mapping - Only for Phase 2, 3, or 4 */}
        {showArchivedMapping && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <Label className="text-xs font-medium">Link to Previous Account</Label>
            </div>

            {archivedAccounts.length > 0 ? (
              <div className="space-y-1.5 max-h-[120px] overflow-y-auto overflow-x-hidden">
                {archivedAccounts.map((account) => {
                  const isSelected = formData.previous_account_id === account.id;
                  const firmLogo = PROP_FIRMS.find(f => f.name === account.prop_firm)?.logo;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          previous_account_id: isSelected ? '' : account.id,
                          evaluation_fee: isSelected ? 0 : (account.evaluation_fee || formData.evaluation_fee),
                          account_size: isSelected ? 0 : (account.account_size || formData.account_size),
                        });
                      }}
                      className={cn(
                        "w-full p-2 rounded-md border transition-all text-left",
                        "hover:bg-muted/50",
                        isSelected ? "border-primary bg-primary/10" : "border-border/30"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center overflow-hidden shrink-0">
                          {firmLogo ? (
                            <img 
                              src={firmLogo}
                              alt={account.prop_firm || ''}
                              className="w-3.5 h-3.5 object-contain"
                              referrerPolicy="no-referrer"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <Archive className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                        <span className="text-xs font-medium truncate flex-1">{account.account_name}</span>
                        {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">No archived accounts</p>
            )}
          </div>
        )}

        {/* Evaluation Fee - Using NumberInput for consistent styling */}
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium whitespace-nowrap flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            Eval Fee
          </Label>
          <NumberInput
            id="evaluation_fee"
            value={formData.evaluation_fee || 0}
            onChange={(value) => setFormData({ ...formData, evaluation_fee: value })}
            min={0}
            step={10}
          />
        </div>

        {/* Compact Summary */}
        {(selectedArchivedAccount || formData.evaluation_fee > 0) && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">
              Phase {formData.evaluation_phase}
              {formData.evaluation_fee > 0 && ` • $${formData.evaluation_fee} fee`}
              {selectedArchivedAccount && ` • Linked`}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderPropDetailsStep = () => (
    <div className="space-y-3 py-2">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="account_name" className="text-sm">Account Name</Label>
          <Input
            id="account_name"
            placeholder="My FTMO Challenge"
            value={formData.account_name}
            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            className="h-9 bg-muted/30 border-border/50"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account_size" className="text-sm">Account Size</Label>
          <Select
            value={formData.account_size.toString()}
            onValueChange={(value) => setFormData({ ...formData, account_size: parseInt(value) })}
          >
            <SelectTrigger className="h-9 bg-muted/30 border-border/50">
              <SelectValue placeholder="Select account size" />
            </SelectTrigger>
            <SelectContent className="bg-card/95 backdrop-blur-xl border-border/30">
              {ACCOUNT_SIZES.map((size) => (
                <SelectItem key={size.value} value={size.value.toString()}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prop Firm Rules - Always visible */}
        <div className="space-y-2">
          <Label className="text-sm">Prop Firm Rules</Label>
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="space-y-1">
              <Label htmlFor="profit_target" className="text-xs text-muted-foreground">Profit Target (%)</Label>
              <NumberInput
                id="profit_target"
                value={formData.profit_target}
                onChange={(value) => setFormData({ ...formData, profit_target: value })}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max_loss" className="text-xs text-muted-foreground">Max Loss (%)</Label>
              <NumberInput
                id="max_loss"
                value={formData.max_loss}
                onChange={(value) => setFormData({ ...formData, max_loss: value })}
                min={0}
                max={100}
                step={1}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max_daily_loss" className="text-xs text-muted-foreground">Daily Loss (%)</Label>
              <NumberInput
                id="max_daily_loss"
                value={formData.max_daily_loss}
                onChange={(value) => setFormData({ ...formData, max_daily_loss: value })}
                min={0}
                max={100}
                step={0.5}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="min_trading_days" className="text-xs text-muted-foreground">Min Days</Label>
              <NumberInput
                id="min_trading_days"
                value={formData.min_trading_days}
                onChange={(value) => setFormData({ ...formData, min_trading_days: value })}
                min={0}
                step={1}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderListeningStep = () => {
    // Filter out accounts that are already connected (match by login + server)
    // Archived accounts are excluded so their terminal can be re-used
    const existingLoginServers = new Set(
      existingAccounts
        .filter(acc => acc.login && acc.server && !acc.is_archived)
        .map(acc => `${acc.login}@${acc.server}`)
    );
    const availableDetectedAccounts = detectedAccounts.filter(
      acc => !existingLoginServers.has(`${acc.login}@${acc.server}`)
    );
    const availableCount = availableDetectedAccounts.length;
    
    return (
    <div className="space-y-4 py-2 pb-4">
      {/* Connection status banner */}
      <div className={cn(
        "flex items-center gap-3 p-4 rounded-lg border transition-all",
        availableCount > 0
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-primary/10 border-primary/30"
      )}>
        <div className={cn(
          "relative w-10 h-10 rounded-full flex items-center justify-center",
          availableCount > 0 ? "bg-emerald-500/20" : "bg-primary/20"
        )}>
          {availableCount > 0 ? (
            <Wifi className="h-5 w-5 text-emerald-400" />
          ) : (
            <>
              <Radio className="h-5 w-5 text-primary animate-pulse" />
              {/* Pulse animation rings */}
              <span className="absolute inset-0 rounded-full border-2 border-primary/50 animate-ping" />
            </>
          )}
        </div>
        <div className="flex-1">
          <p className={cn(
            "text-sm font-medium",
            availableCount > 0 ? "text-emerald-400" : "text-primary"
          )}>
            {availableCount > 0 
              ? `${availableCount} account${availableCount > 1 ? 's' : ''} detected`
              : "Listening for connections..."
            }
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {availableCount > 0 
              ? "Select an account below to connect"
              : `Waiting for ${platform === 'cTrader' ? 'cBot' : 'Expert Advisor'} to connect...`
            }
          </p>
        </div>
      </div>

      {/* Platform instructions */}
      {availableCount === 0 && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-xs font-medium text-foreground mb-2">How to connect:</p>
          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
            <li>Open <span className="text-foreground font-medium">{platform}</span> and login to your account</li>
            <li>Attach the <span className="text-foreground font-medium">{platform === 'cTrader' ? 'HedgeEdge cBot' : 'HedgeEdge EA'}</span> to any chart</li>
            <li>Account details will appear here automatically</li>
          </ol>
        </div>
      )}

      {/* Detected accounts list - already filtered to exclude connected accounts */}
      {availableDetectedAccounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Available Accounts
          </p>
          <div className="space-y-2 max-h-[200px] overflow-y-auto overflow-x-hidden pr-1">
            {availableDetectedAccounts.map((account, idx) => (
              <button
                key={`${account.login}-${account.server}`}
                type="button"
                onClick={() => setSelectedDetectedAccount(account)}
                className={cn(
                  "w-full p-3 rounded-xl border transition-all text-left",
                  "hover:bg-muted/30 hover:scale-[1.01]",
                  selectedDetectedAccount?.login === account.login
                    ? "border-primary bg-primary/10"
                    : "border-border/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{account.broker || 'Trading Account'}</p>
                      {selectedDetectedAccount?.login === account.login && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {account.login}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Server className="h-3 w-3" />
                        {account.server}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {account.currency} {account.balance?.toLocaleString() || '—'}
                      </span>
                      {account.leverage && (
                        <span className="text-xs text-muted-foreground">
                          1:{account.leverage}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary of account being created */}
      <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
        <p className="text-xs text-muted-foreground mb-2">Account Summary</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Account Name</span>
            <span className="font-medium">{formData.account_name || '—'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Platform</span>
            <span className="font-medium">{platform}</span>
          </div>
          {formData.prop_firm && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Prop Firm</span>
              <span className="font-medium">{formData.prop_firm}</span>
            </div>
          )}
          {formData.account_size > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Account Size</span>
              <span className="font-medium">${formData.account_size.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Cancel link */}
      <button
        type="button"
        onClick={() => {
          if (listeningIntervalRef.current) {
            clearInterval(listeningIntervalRef.current);
          }
          setIsListening(false);
          toast.error('Connection cancelled', {
            description: 'No account was connected',
          });
          onOpenChange(false);
        }}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors text-center mt-2"
      >
        Cancel and close
      </button>
    </div>
    );
  };

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] border-border/30 bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-xl font-semibold">
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {step === 'account-type' && renderAccountTypeStep()}
          {step === 'platform' && renderPlatformStep()}
          {step === 'terminal' && renderTerminalStep()}
          {step === 'prop-firm' && renderPropFirmStep()}
          {step === 'hedge-pipeline' && renderHedgePipelineStep()}
          {step === 'prop-details' && renderPropDetailsStep()}
          {step === 'listening' && renderListeningStep()}
        </div>

        {/* Fixed navigation buttons */}
        <div className="flex gap-3 pt-4 flex-shrink-0 border-t border-border/30 mt-4">
          {step !== 'account-type' && step !== 'listening' && (
            <Button 
              variant="outline" 
              onClick={() => {
                if (step === 'platform') setStep('account-type');
                else if (step === 'terminal') setStep('platform');
                else if (step === 'prop-firm') setStep('terminal');
                else if (step === 'hedge-pipeline') setStep('prop-firm');
                else if (step === 'prop-details') setStep('hedge-pipeline');
              }} 
              className="flex-1"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {step === 'account-type' && (
            <Button
              onClick={() => setStep('platform')}
              disabled={!accountPhase}
              className="flex-1"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'platform' && (
            <Button
              onClick={() => {
                if (platform !== 'cTrader') {
                  detectTerminals();
                }
                setStep('terminal');
              }}
              disabled={!platform}
              className="flex-1"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'terminal' && (
            <Button
              onClick={() => {
                // For hedge accounts (live), skip prop firm selection and go to listening
                if (accountPhase === 'live') {
                  if (!formData.account_name) {
                    setFormData({ ...formData, account_name: `${platform} Hedge Account` });
                  }
                  startListening();
                  setStep('listening');
                } else {
                  setStep('prop-firm');
                }
              }}
              disabled={!selectedTerminal && terminals.length > 0 && platform !== 'cTrader'}
              className="flex-1"
            >
              {accountPhase === 'live' ? (
                <>
                  Connect Account
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  {terminals.length === 0 ? 'Skip' : 'Continue'}
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
          {step === 'prop-firm' && (
            <Button
              onClick={() => setStep('hedge-pipeline')}
              disabled={!formData.prop_firm}
              className="flex-1"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'hedge-pipeline' && (
            <Button
              onClick={() => setStep('prop-details')}
              className="flex-1"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'prop-details' && (
            <Button
              onClick={() => {
                startListening();
                setStep('listening');
              }}
              disabled={loading || !formData.account_name || !formData.account_size}
              className="flex-1"
            >
              Connect Account
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {step === 'listening' && (
            <Button
              onClick={() => {
                if (selectedDetectedAccount) {
                  handleFinalizeWithAccount(selectedDetectedAccount);
                }
              }}
              disabled={loading || !selectedDetectedAccount}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Connect Account
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
