import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
  Cpu,
  Globe,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Info,
} from 'lucide-react';
import type { PermissionCheckItem } from '@/types/connections';

// ============================================================================
// Types
// ============================================================================

interface PermissionsChecklistProps {
  /** Platform type */
  platform: 'mt4' | 'mt5' | 'ctrader';
  /** Compact mode for inline display */
  compact?: boolean;
  /** Show even when all permissions are granted */
  showWhenComplete?: boolean;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Permission Definitions (shortened descriptions)
// ============================================================================

const MT4_MT5_PERMISSIONS: PermissionCheckItem[] = [
  {
    id: 'algo-trading',
    label: 'Enable Algorithmic Trading',
    description: 'Allows Expert Advisors to open and manage trades automatically',
    required: true,
    status: null,
    instructions: [
      'Tools → Options → Expert Advisors',
      'Check "Allow automated trading"',
    ],
  },
  {
    id: 'dll-imports',
    label: 'Enable DLL Imports',
    description: 'Required for the Hedge Edge Bridge DLL to communicate with the app',
    required: true,
    status: null,
    instructions: [
      'Check "Allow DLL imports" in Expert Advisors settings',
    ],
  },
  {
    id: 'webrequest',
    label: 'WebRequest Allowlist',
    description: 'Required for the EA to validate your license with Hedge Edge servers',
    required: true,
    status: null,
    instructions: [
      'Add https://api.hedge-edge.com to allowed URLs',
    ],
  },
];

const CTRADER_PERMISSIONS: PermissionCheckItem[] = [
  {
    id: 'cbot-permissions',
    label: 'Allow cBot Execution',
    description: 'Enable automated trading for cBots',
    required: true,
    status: null,
    instructions: [
      'Settings → Automate → Enable automated trading',
    ],
  },
];

// ============================================================================
// Component - Compact Version for Modal
// ============================================================================

export function PermissionsChecklist({
  platform,
  compact = false,
  showWhenComplete = true,
  className,
}: PermissionsChecklistProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const permissions = platform === 'ctrader' ? CTRADER_PERMISSIONS : MT4_MT5_PERMISSIONS;
  const isMetaTrader = platform === 'mt4' || platform === 'mt5';
  const platformName = platform === 'mt4' ? 'MetaTrader 4' : 
                       platform === 'mt5' ? 'MetaTrader 5' : 'cTrader';

  const copyApiUrl = async () => {
    await navigator.clipboard.writeText('https://api.hedge-edge.com');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Always use compact view in modals - single collapsible section
  return (
    <TooltipProvider>
      <Collapsible open={expanded} onOpenChange={setExpanded} className={className}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors text-left">
            <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            <span className="text-sm text-yellow-600 dark:text-yellow-400 flex-1">
              {platformName} Permissions
            </span>
            <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30">
              {permissions.filter(p => p.required).length} required
            </Badge>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-yellow-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-yellow-500" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/30 space-y-2">
            {permissions.filter(p => p.required).map((perm) => (
              <div key={perm.id} className="flex items-center gap-2 text-sm">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {perm.id === 'algo-trading' && <Cpu className="h-3 w-3 text-primary" />}
                  {perm.id === 'dll-imports' && <Shield className="h-3 w-3 text-primary" />}
                  {perm.id === 'webrequest' && <Globe className="h-3 w-3 text-primary" />}
                  {perm.id === 'cbot-permissions' && <Cpu className="h-3 w-3 text-primary" />}
                </div>
                <span className="text-foreground flex-1">{perm.label}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="text-xs">{perm.instructions[0]}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
            
            {isMetaTrader && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/30 mt-2">
                <RefreshCw className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-muted-foreground">Restart terminal after changes</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </TooltipProvider>
  );
}

// ============================================================================
// cTrader Guidance Component (Compact)
// ============================================================================

interface CTraderGuidanceProps {
  className?: string;
}

export function CTraderGuidance({ className }: CTraderGuidanceProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} className={className}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left">
          <Shield className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm text-blue-600 dark:text-blue-400 flex-1">
            cTrader Setup Guide
          </span>
          <Badge variant="outline" className="text-[10px] text-blue-500 border-blue-500/30">
            3 steps
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-blue-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-blue-500" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border/30 space-y-3">
          {/* Steps as compact list */}
          <div className="space-y-2">
            {[
              { step: 1, title: 'Install cBot', desc: 'Download .algo file, double-click to install' },
              { step: 2, title: 'Add Instance', desc: 'Automate panel → Right-click → Add Instance' },
              { step: 3, title: 'Enter License', desc: 'Set your license key in cBot parameters' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-2 text-sm">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] h-5 w-5 flex items-center justify-center p-0 shrink-0">
                  {item.step}
                </Badge>
                <div className="flex-1">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-muted-foreground"> — {item.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            <CheckCircle2 className="h-3 w-3 text-primary" />
            <span className="text-xs text-muted-foreground">No DLL imports required for cTrader</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
