/**
 * Agent Connection Panel
 * ======================
 * Displays the status of trading agents (MT5/cTrader) and allows
 * configuration of bundled vs external agent modes.
 */

import { useState, useEffect, useCallback } from 'react';
import { isElectron } from '@/lib/desktop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  WifiOff, 
  Server, 
  Settings, 
  RefreshCw, 
  Play, 
  Square,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type AgentMode = 'bundled' | 'external' | 'not-configured';
type AgentStatus = 'stopped' | 'starting' | 'running' | 'connected' | 'error' | 'not-available';

interface AgentHealthStatus {
  platform: 'mt5' | 'ctrader';
  status: AgentStatus;
  port: number;
  pid: number | null;
  uptime: number | null;
  restartCount: number;
  lastError: string | null;
  isBundled: boolean;
  isExternal: boolean;
}

interface AgentConfigSummary {
  mt5: { mode: AgentMode; endpoint: string; hasBundled: boolean };
  ctrader: { mode: AgentMode; endpoint: string; hasBundled: boolean };
}

interface PlatformConfig {
  mode: AgentMode;
  host: string;
  port: number;
}

// ============================================================================
// Status Display Helpers
// ============================================================================

function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'running':
      return 'bg-blue-500';
    case 'starting':
      return 'bg-yellow-500';
    case 'stopped':
      return 'bg-gray-500';
    case 'error':
      return 'bg-red-500';
    case 'not-available':
      return 'bg-gray-400';
    default:
      return 'bg-gray-500';
  }
}

function getStatusIcon(status: AgentStatus) {
  switch (status) {
    case 'connected':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'running':
      return <Wifi className="h-4 w-4 text-blue-500" />;
    case 'starting':
      return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
    case 'stopped':
      return <WifiOff className="h-4 w-4 text-gray-500" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case 'not-available':
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <WifiOff className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'running':
      return 'Running';
    case 'starting':
      return 'Starting...';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return 'Error';
    case 'not-available':
      return 'Not Available';
    default:
      return 'Unknown';
  }
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '-';
  
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

// ============================================================================
// Agent Status Card Component
// ============================================================================

interface AgentStatusCardProps {
  platform: 'mt5' | 'ctrader';
  health: AgentHealthStatus | null;
  config: { mode: AgentMode; endpoint: string; hasBundled: boolean } | null;
  onConfigure: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

function AgentStatusCard({ 
  platform, 
  health, 
  config, 
  onConfigure, 
  onRefresh,
  isLoading,
}: AgentStatusCardProps) {
  const [isActioning, setIsActioning] = useState(false);
  
  const platformLabel = platform === 'mt5' ? 'MT5' : 'cTrader';
  const status = health?.status || 'not-available';
  const mode = config?.mode || 'not-configured';
  
  const handleStart = async () => {
    if (!window.electronAPI?.agent) return;
    setIsActioning(true);
    try {
      await window.electronAPI.agent.start(platform);
      onRefresh();
    } catch (error) {
      console.error('Failed to start agent:', error);
    } finally {
      setIsActioning(false);
    }
  };
  
  const handleStop = async () => {
    if (!window.electronAPI?.agent) return;
    setIsActioning(true);
    try {
      await window.electronAPI.agent.stop(platform);
      onRefresh();
    } catch (error) {
      console.error('Failed to stop agent:', error);
    } finally {
      setIsActioning(false);
    }
  };
  
  const handleRestart = async () => {
    if (!window.electronAPI?.agent) return;
    setIsActioning(true);
    try {
      await window.electronAPI.agent.restart(platform);
      onRefresh();
    } catch (error) {
      console.error('Failed to restart agent:', error);
    } finally {
      setIsActioning(false);
    }
  };
  
  const canStart = mode === 'bundled' && ['stopped', 'error'].includes(status);
  const canStop = mode === 'bundled' && ['running', 'connected', 'starting'].includes(status);
  const canRestart = mode === 'bundled' && ['running', 'connected', 'error'].includes(status);
  
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <CardTitle className="text-lg">{platformLabel} Agent</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {mode === 'bundled' ? 'Bundled' : mode === 'external' ? 'External' : 'Not Configured'}
            </Badge>
            <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
          </div>
        </div>
        <CardDescription>
          {config?.endpoint || 'No endpoint configured'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon(status)}
              <span className="text-sm font-medium">{getStatusLabel(status)}</span>
            </div>
            {health?.uptime !== null && (
              <span className="text-xs text-muted-foreground">
                Uptime: {formatUptime(health.uptime)}
              </span>
            )}
          </div>
          
          {/* Error Message */}
          {health?.lastError && (
            <div className="rounded-md bg-red-500/10 p-2 text-xs text-red-500">
              {health.lastError}
            </div>
          )}
          
          {/* Not Available Guidance */}
          {status === 'not-available' && (
            <div className="rounded-md bg-yellow-500/10 p-3 text-sm">
              <p className="font-medium text-yellow-600 dark:text-yellow-400">
                Agent not configured
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {config?.hasBundled 
                  ? 'Bundled agent available. Click Configure to set up.'
                  : 'No bundled agent found. Configure an external agent or install the bundled agent.'}
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleStart}
                disabled={isActioning || isLoading}
              >
                {isActioning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
                Start
              </Button>
            )}
            {canStop && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleStop}
                disabled={isActioning || isLoading}
              >
                {isActioning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Square className="mr-1 h-3 w-3" />}
                Stop
              </Button>
            )}
            {canRestart && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleRestart}
                disabled={isActioning || isLoading}
              >
                {isActioning ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                Restart
              </Button>
            )}
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onConfigure}
            >
              <Settings className="mr-1 h-3 w-3" />
              Configure
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Configuration Dialog Component
// ============================================================================

interface ConfigDialogProps {
  platform: 'mt5' | 'ctrader';
  currentConfig: { mode: AgentMode; endpoint: string; hasBundled: boolean } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: PlatformConfig) => Promise<void>;
  onReset: () => Promise<void>;
}

function ConfigDialog({ 
  platform, 
  currentConfig, 
  open, 
  onOpenChange,
  onSave,
  onReset,
}: ConfigDialogProps) {
  const platformLabel = platform === 'mt5' ? 'MT5' : 'cTrader';
  const defaultPort = platform === 'mt5' ? 5101 : 5102;
  
  const parseEndpoint = useCallback((endpoint: string) => {
    const [host, portStr] = endpoint.split(':');
    return {
      host: host || '127.0.0.1',
      port: parseInt(portStr, 10) || defaultPort,
    };
  }, [defaultPort]);
  
  const parsed = currentConfig ? parseEndpoint(currentConfig.endpoint) : { host: '127.0.0.1', port: defaultPort };
  
  const [mode, setMode] = useState<AgentMode>(currentConfig?.mode || 'not-configured');
  const [host, setHost] = useState(parsed.host);
  const [port, setPort] = useState(parsed.port);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Reset form when dialog opens
  useEffect(() => {
    if (open && currentConfig) {
      const parsedValue = parseEndpoint(currentConfig.endpoint);
      setMode(currentConfig.mode);
      setHost(parsedValue.host);
      setPort(parsedValue.port);
      setError(null);
    }
  }, [open, currentConfig, parseEndpoint]);
  
  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    
    try {
      // Validate port
      if (port < 1 || port > 65535) {
        throw new Error('Port must be between 1 and 65535');
      }
      
      // Validate host for external mode
      if (mode === 'external' && !host.trim()) {
        throw new Error('Host is required for external mode');
      }
      
      await onSave({ mode, host, port });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleReset = async () => {
    setError(null);
    setIsSaving(true);
    
    try {
      await onReset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset configuration');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {platformLabel} Agent</DialogTitle>
          <DialogDescription>
            Choose between bundled agent (auto-managed) or external agent (self-managed).
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Mode Selection */}
          <div className="space-y-2">
            <Label htmlFor="mode">Agent Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as AgentMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bundled" disabled={!currentConfig?.hasBundled}>
                  Bundled {!currentConfig?.hasBundled && '(not installed)'}
                </SelectItem>
                <SelectItem value="external">External</SelectItem>
                <SelectItem value="not-configured">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {mode === 'bundled' && 'App will automatically start and manage the agent.'}
              {mode === 'external' && 'Connect to an agent you run separately (e.g., on a VPS).'}
              {mode === 'not-configured' && 'Agent will not be used.'}
            </p>
          </div>
          
          {/* External Mode Settings */}
          {mode === 'external' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="127.0.0.1 or your-vps.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value, 10) || defaultPort)}
                  min={1}
                  max={65535}
                />
              </div>
            </>
          )}
          
          {/* Bundled Mode Info */}
          {mode === 'bundled' && (
            <div className="rounded-md bg-blue-500/10 p-3 text-sm">
              <p className="font-medium text-blue-600 dark:text-blue-400">Bundled Agent</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The agent will run on port {defaultPort}. Logs are saved for troubleshooting.
              </p>
            </div>
          )}
          
          {/* Error Display */}
          {error && (
            <div className="rounded-md bg-red-500/10 p-2 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter className="flex justify-between">
          <Button variant="ghost" onClick={handleReset} disabled={isSaving}>
            Reset to Default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Connection Panel Component
// ============================================================================

interface ConnectionPanelProps {
  /** Compact mode for embedding in sidebar */
  compact?: boolean;
  /** Only show specific platform */
  platform?: 'mt5' | 'ctrader';
}

export function ConnectionPanel({ compact = false, platform }: ConnectionPanelProps) {
  const [config, setConfig] = useState<AgentConfigSummary | null>(null);
  const [health, setHealth] = useState<{ mt5: AgentHealthStatus; ctrader: AgentHealthStatus } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [configDialogPlatform, setConfigDialogPlatform] = useState<'mt5' | 'ctrader' | null>(null);
  
  const loadData = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.agent) {
      setIsLoading(false);
      return;
    }
    
    try {
      const [configData, healthData] = await Promise.all([
        window.electronAPI.agent.getConfig(),
        window.electronAPI.agent.getHealthStatus(),
      ]);
      setConfig(configData);
      setHealth(healthData);
    } catch (error) {
      console.error('Failed to load agent data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Initial load and polling
  useEffect(() => {
    loadData();
    
    // Subscribe to status updates
    if (isElectron() && window.electronAPI?.agent) {
      const unsubscribe = window.electronAPI.agent.onStatusChange((status) => {
        setHealth(status);
      }, 5000);
      
      return unsubscribe;
    }
  }, [loadData]);
  
  const handleSaveConfig = async (targetPlatform: 'mt5' | 'ctrader', newConfig: PlatformConfig) => {
    if (!isElectron() || !window.electronAPI?.agent) {
      throw new Error('Agent management is only available in the desktop app');
    }
    
    const result = await window.electronAPI.agent.setConfig(targetPlatform, {
      mode: newConfig.mode,
      host: newConfig.host,
      port: newConfig.port,
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to save configuration');
    }
    
    // Reload config
    await loadData();
  };
  
  const handleResetConfig = async (targetPlatform: 'mt5' | 'ctrader') => {
    if (!isElectron() || !window.electronAPI?.agent) {
      throw new Error('Agent management is only available in the desktop app');
    }
    
    const result = await window.electronAPI.agent.resetConfig(targetPlatform);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to reset configuration');
    }
    
    // Reload config
    await loadData();
  };
  
  // Not in Electron
  if (!isElectron()) {
    return null;
  }
  
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  // Compact mode (for sidebar)
  if (compact) {
    const platforms = platform ? [platform] : ['mt5', 'ctrader'] as const;
    
    return (
      <div className="space-y-2 p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Trading Agents</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={loadData}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        {platforms.map((p) => {
          const platformHealth = health?.[p];
          const platformConfig = config?.[p];
          const status = platformHealth?.status || 'not-available';
          
          return (
            <div 
              key={p}
              className="flex items-center justify-between rounded-md border p-2"
            >
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${getStatusColor(status)}`} />
                <span className="text-sm">{p === 'mt5' ? 'MT5' : 'cTrader'}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => setConfigDialogPlatform(p)}
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{getStatusLabel(status)} ({platformConfig?.mode || 'not configured'})</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
        
        {/* Config Dialog */}
        {configDialogPlatform && (
          <ConfigDialog
            platform={configDialogPlatform}
            currentConfig={config?.[configDialogPlatform] || null}
            open={!!configDialogPlatform}
            onOpenChange={(open) => !open && setConfigDialogPlatform(null)}
            onSave={(newConfig) => handleSaveConfig(configDialogPlatform, newConfig)}
            onReset={() => handleResetConfig(configDialogPlatform)}
          />
        )}
      </div>
    );
  }
  
  // Full panel mode
  const platforms = platform ? [platform] : ['mt5', 'ctrader'] as const;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Trading Agent Connections</h3>
        <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {platforms.map((p) => (
          <AgentStatusCard
            key={p}
            platform={p}
            health={health?.[p] || null}
            config={config?.[p] || null}
            onConfigure={() => setConfigDialogPlatform(p)}
            onRefresh={loadData}
            isLoading={isLoading}
          />
        ))}
      </div>
      
      {/* Help text */}
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium">How it works:</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li><strong>Bundled:</strong> The app manages the agent automatically. Best for local trading.</li>
          <li><strong>External:</strong> Connect to an agent running elsewhere (VPS, server). Configure the host and port.</li>
          <li>Default ports: MT5 = 5101, cTrader = 5102</li>
        </ul>
      </div>
      
      {/* Config Dialog */}
      {configDialogPlatform && (
        <ConfigDialog
          platform={configDialogPlatform}
          currentConfig={config?.[configDialogPlatform] || null}
          open={!!configDialogPlatform}
          onOpenChange={(open) => !open && setConfigDialogPlatform(null)}
          onSave={(newConfig) => handleSaveConfig(configDialogPlatform, newConfig)}
          onReset={() => handleResetConfig(configDialogPlatform)}
        />
      )}
    </div>
  );
}

export default ConnectionPanel;
