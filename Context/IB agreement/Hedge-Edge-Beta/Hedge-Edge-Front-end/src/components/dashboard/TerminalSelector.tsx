/**
 * Terminal Selector Component
 * 
 * Displays detected MT4/MT5/cTrader terminal installations
 * with selection UI and launch functionality.
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  RefreshCw, 
  Monitor, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Folder
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/desktop';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

type TerminalType = 'mt4' | 'mt5' | 'ctrader';

interface DetectedTerminal {
  id: string;
  type: TerminalType;
  name: string;
  executablePath: string;
  installPath: string;
  broker?: string;
  version?: string;
  isRunning?: boolean;
  terminalId?: string;  // GUID for MetaQuotes terminals
  dataPath?: string;    // Data folder path
}

interface DetectionResult {
  success: boolean;
  terminals: DetectedTerminal[];
  error?: string;
  deepScan?: boolean;
}

interface TerminalSelectorProps {
  /** Filter terminals by platform type */
  platformFilter?: 'MT4' | 'MT5' | 'cTrader';
  /** Callback when terminal is selected */
  onSelect: (terminal: DetectedTerminal) => void;
  /** Currently selected terminal ID */
  selectedId?: string;
  /** Disable selection */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function TerminalSelector({
  platformFilter,
  onSelect,
  selectedId,
  disabled = false,
  className,
}: TerminalSelectorProps) {
  const [terminals, setTerminals] = useState<DetectedTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);

  // Filter type based on platformFilter prop
  const filterType = platformFilter?.toLowerCase() as TerminalType | undefined;

  // Detect terminals
  const detectTerminals = useCallback(async () => {
    if (!isElectron()) {
      setError('Terminal detection is only available in desktop mode');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result: DetectionResult = await window.electronAPI!.terminals.detect();
      
      if (result.success) {
        let detected = result.terminals;
        
        // Apply platform filter if specified
        if (filterType) {
          detected = detected.filter(t => t.type === filterType);
        }
        
        setTerminals(detected);
        
        if (detected.length === 0) {
          const platformName = platformFilter || 'trading terminal';
          setError(`No ${platformName} installations found on this computer`);
        }
      } else {
        setError(result.error || 'Failed to detect terminals');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  }, [filterType, platformFilter]);

  // Initial detection on mount
  useEffect(() => {
    detectTerminals();
  }, [detectTerminals]);

  // Launch terminal
  const handleLaunch = async (terminal: DetectedTerminal) => {
    if (!isElectron()) return;

    setLaunching(terminal.id);

    try {
      const result = await window.electronAPI!.terminals.launch(terminal.executablePath);
      
      if (result.success) {
        toast.success('Terminal launched', {
          description: `Starting ${terminal.name}...`,
        });
        
        // Re-detect after a short delay to update running status
        setTimeout(() => detectTerminals(), 2000);
      } else {
        toast.error('Failed to launch terminal', {
          description: result.error,
        });
      }
    } catch (err) {
      toast.error('Launch error', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLaunching(null);
    }
  };

  // Handle terminal selection
  const handleSelect = (terminal: DetectedTerminal) => {
    if (disabled) return;
    onSelect(terminal);
  };

  // Get icon color based on terminal type
  const getIconColor = (type: TerminalType) => {
    switch (type) {
      case 'mt4':
      case 'mt5':
        return 'bg-blue-500/20 text-blue-400';
      case 'ctrader':
        return 'bg-cyan-500/20 text-cyan-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-muted-foreground", className)}>
        <Loader2 className="h-8 w-8 animate-spin mb-3" />
        <p className="text-sm">Scanning for terminals...</p>
      </div>
    );
  }

  // Error state with no terminals
  if (error && terminals.length === 0) {
    return (
      <div className={cn("p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20", className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-yellow-400 mb-2">{error}</p>
            <p className="text-xs text-muted-foreground mb-3">
              Make sure {platformFilter || 'MT4/MT5/cTrader'} is installed on this computer.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectTerminals()}
              className="gap-2"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check if any terminal is running
  const hasRunningTerminal = terminals.some(t => t.isRunning);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {terminals.length} terminal{terminals.length !== 1 ? 's' : ''} found
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => detectTerminals()}
          disabled={loading}
          className="h-7 px-2 text-xs gap-1"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Notice when no terminals are running */}
      {terminals.length > 0 && !hasRunningTerminal && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
          <Play className="h-4 w-4 shrink-0" />
          <span className="text-xs">Launch a terminal to let the Expert Advisor connect</span>
        </div>
      )}

      {/* Terminal list */}
      <div className="space-y-2 max-h-[240px] overflow-y-auto overflow-x-hidden pr-1">
        {terminals.map((terminal) => {
          const isSelected = selectedId === terminal.id;
          const isLaunching = launching === terminal.id;

          return (
            <div
              key={terminal.id}
              role="button"
              tabIndex={disabled ? -1 : 0}
              onClick={() => handleSelect(terminal)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(terminal); } }}
              className={cn(
                "w-full p-3 rounded-lg border transition-all text-left group cursor-pointer",
                "hover:bg-muted/50",
                isSelected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/30 bg-muted/20",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  getIconColor(terminal.type)
                )}>
                  <Monitor className="h-5 w-5" />
                </div>

                {/* Info - Path as primary, name as subtitle */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate" title={terminal.installPath}>
                        {terminal.installPath}
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="truncate">{terminal.name}</span>
                    {terminal.terminalId && (
                      <span className="text-[10px] font-mono opacity-60 truncate" title={`Terminal ID: ${terminal.terminalId}`}>
                        [{terminal.terminalId.substring(0, 8)}...]
                      </span>
                    )}
                    {terminal.broker && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {terminal.broker}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
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
                        handleLaunch(terminal);
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
    </div>
  );
}

export default TerminalSelector;
