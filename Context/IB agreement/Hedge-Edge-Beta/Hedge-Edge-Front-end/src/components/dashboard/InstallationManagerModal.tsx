import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/desktop';
import {
  Loader2,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Monitor,
  HardDrive,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Package,
  Shield,
  Cpu,
} from 'lucide-react';
import type {
  InstallableAsset,
  InstallationTarget,
  InstallationPrecheck,
  InstallationResult,
  AssetInstallResult,
} from '@/types/connections';

// ============================================================================
// Types
// ============================================================================

interface InstallationManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected terminal type filter */
  terminalFilter?: 'mt4' | 'mt5' | 'ctrader';
  /** Callback after successful installation */
  onInstallComplete?: (result: InstallationResult) => void;
}

type InstallStep = 'select' | 'precheck' | 'installing' | 'complete';

// ============================================================================
// Asset Definitions
// ============================================================================

const MT5_ASSETS: InstallableAsset[] = [
  {
    type: 'mt5-ea',
    name: 'Hedge Edge EA',
    fileName: 'HedgeEdge.ex5',
    version: '1.0.0',
    required: true,
    targetSubdir: 'MQL5/Experts',
    description: 'Main Expert Advisor for trade copying and hedging',
  },
  {
    type: 'mt5-dll',
    name: 'Hedge Edge Bridge DLL',
    fileName: 'HedgeEdgeBridge.dll',
    version: '1.0.0',
    required: true,
    targetSubdir: 'MQL5/Libraries',
    description: 'Communication bridge for real-time data sync',
  },
];

const MT4_ASSETS: InstallableAsset[] = [
  {
    type: 'mt4-ea',
    name: 'Hedge Edge EA',
    fileName: 'HedgeEdge.ex4',
    version: '1.0.0',
    required: true,
    targetSubdir: 'MQL4/Experts',
    description: 'Main Expert Advisor for trade copying and hedging',
  },
  {
    type: 'mt4-dll',
    name: 'Hedge Edge Bridge DLL',
    fileName: 'HedgeEdgeBridge.dll',
    version: '1.0.0',
    required: true,
    targetSubdir: 'MQL4/Libraries',
    description: 'Communication bridge for real-time data sync',
  },
];

const CTRADER_ASSETS: InstallableAsset[] = [
  {
    type: 'ctrader-cbot',
    name: 'Hedge Edge cBot',
    fileName: 'HedgeEdge.algo',
    version: '1.0.0',
    required: true,
    targetSubdir: 'cBots',
    description: 'Automated trading bot for cTrader platform',
  },
];

// ============================================================================
// Component
// ============================================================================

export function InstallationManagerModal({
  open,
  onOpenChange,
  terminalFilter,
  onInstallComplete,
}: InstallationManagerModalProps) {
  // State
  const [step, setStep] = useState<InstallStep>('select');
  const [selectedType, setSelectedType] = useState<'mt4' | 'mt5' | 'ctrader' | null>(terminalFilter || null);
  const [terminals, setTerminals] = useState<InstallationTarget[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<InstallationTarget | null>(null);
  const [customPath, setCustomPath] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<InstallationPrecheck | null>(null);
  const [installResult, setInstallResult] = useState<InstallationResult | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, { verified: boolean; hash?: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('select');
      setSelectedType(terminalFilter || null);
      setSelectedTerminal(null);
      setCustomPath(null);
      setPrecheck(null);
      setInstallResult(null);
      setVerificationResults({});
      setLoading(false);
      setError(null);
      setInstallProgress(0);
    }
  }, [open, terminalFilter]);

  // Get assets for selected type
  const getAssets = useCallback((): InstallableAsset[] => {
    switch (selectedType) {
      case 'mt4': return MT4_ASSETS;
      case 'mt5': return MT5_ASSETS;
      case 'ctrader': return CTRADER_ASSETS;
      default: return [];
    }
  }, [selectedType]);

  // Detect terminals
  const detectTerminals = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.terminals) {
      setError('Terminal detection requires desktop app');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.terminals.detect();
      if (result.success) {
        const filtered = result.terminals
          .filter(t => !selectedType || t.type === selectedType)
          .map(t => ({
            terminalId: t.id,
            type: t.type as 'mt4' | 'mt5' | 'ctrader',
            name: t.name,
            dataPath: t.dataPath || t.installPath,
            isRunning: t.isRunning || false,
          }));
        setTerminals(filtered);
        
        if (filtered.length === 0) {
          setError(`No ${selectedType?.toUpperCase() || ''} terminals found. Please install the terminal first.`);
        }
      } else {
        setError(result.error || 'Failed to detect terminals');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  }, [selectedType]);

  // Run prechecks
  const runPrechecks = useCallback(async () => {
    if (!selectedTerminal || !isElectron() || !window.electronAPI?.installer) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.installer.precheck(selectedTerminal.terminalId);
      if (result.success && result.data) {
        setPrecheck(result.data);
        setStep('precheck');
      } else {
        setError(result.error || 'Precheck failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Precheck failed');
    } finally {
      setLoading(false);
    }
  }, [selectedTerminal]);

  // Install assets
  const installAssets = useCallback(async () => {
    if (!selectedTerminal || !isElectron() || !window.electronAPI?.installer) {
      return;
    }

    setStep('installing');
    setLoading(true);
    setError(null);
    setInstallProgress(0);
    setVerificationResults({});

    try {
      const assets = getAssets();
      const totalAssets = assets.length;
      const results: AssetInstallResult[] = [];
      const verifyResults: Record<string, { verified: boolean; hash?: string }> = {};

      // Determine target path (custom or auto-detected)
      const targetPath = customPath || selectedTerminal.dataPath;

      for (let i = 0; i < totalAssets; i++) {
        const asset = assets[i];
        setInstallProgress(((i) / totalAssets) * 100);

        // Use installToPath if custom path is set, otherwise use standard installAsset
        let result;
        if (customPath && window.electronAPI.installer.installToPath) {
          result = await window.electronAPI.installer.installToPath(
            asset.type,
            targetPath
          );
        } else {
          result = await window.electronAPI.installer.installAsset(
            selectedTerminal.terminalId,
            asset.type
          );
        }

        results.push({
          type: asset.type,
          success: result.success,
          installedPath: result.data?.installedPath,
          error: result.error,
        });

        // Store verification results if available
        if (result.data?.verified !== undefined) {
          verifyResults[asset.type] = {
            verified: result.data.verified,
            hash: result.data.hash,
          };
        }

        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      setInstallProgress(100);
      setVerificationResults(verifyResults);

      const installResult: InstallationResult = {
        success: results.every(r => r.success),
        terminalId: selectedTerminal.terminalId,
        assets: results,
        restartRequired: selectedTerminal.isRunning,
      };

      setInstallResult(installResult);
      setStep('complete');
      onInstallComplete?.(installResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Installation failed');
      setStep('precheck');
    } finally {
      setLoading(false);
    }
  }, [selectedTerminal, customPath, getAssets, onInstallComplete]);

  // Open manual install folder
  const openInstallFolder = useCallback(async () => {
    if (!selectedTerminal || !isElectron()) return;
    
    try {
      await window.electronAPI?.installer?.openDataFolder(selectedTerminal.terminalId);
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  }, [selectedTerminal]);

  // Select custom path
  const selectCustomPath = useCallback(async () => {
    if (!isElectron() || !window.electronAPI?.installer?.selectPath) {
      setError('Custom path selection requires desktop app');
      return;
    }

    try {
      const result = await window.electronAPI.installer.selectPath();
      if (result.success && result.path) {
        setCustomPath(result.path);
        setError(null);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select path');
    }
  }, []);

  // Clear custom path
  const clearCustomPath = useCallback(() => {
    setCustomPath(null);
  }, []);

  // Select terminal type
  const handleTypeSelect = (type: 'mt4' | 'mt5' | 'ctrader') => {
    setSelectedType(type);
    setSelectedTerminal(null);
    setTerminals([]);
    setError(null);
  };

  // Select terminal and run prechecks
  const handleTerminalSelect = async (terminal: InstallationTarget) => {
    setSelectedTerminal(terminal);
    await runPrechecks();
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'select':
        return (
          <div className="space-y-6">
            {/* Platform Selection */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Select Platform</h3>
              <div className="grid grid-cols-3 gap-3">
                {(['mt4', 'mt5', 'ctrader'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={selectedType === type ? 'default' : 'outline'}
                    className={cn(
                      'h-auto py-4 flex flex-col items-center gap-2',
                      selectedType === type && 'ring-2 ring-primary'
                    )}
                    onClick={() => handleTypeSelect(type)}
                  >
                    <Monitor className="h-6 w-6" />
                    <span className="text-sm font-medium">
                      {type === 'mt4' ? 'MetaTrader 4' : 
                       type === 'mt5' ? 'MetaTrader 5' : 'cTrader'}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Assets to Install */}
            {selectedType && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Components to Install</h3>
                <div className="space-y-2">
                  {getAssets().map((asset) => (
                    <div
                      key={asset.type}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/20"
                    >
                      <Package className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{asset.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            v{asset.version}
                          </Badge>
                          {asset.required && (
                            <Badge variant="secondary" className="text-[10px]">
                              Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {asset.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                            {asset.targetSubdir}/{asset.fileName}
                          </code>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terminal Detection */}
            {selectedType && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Select Terminal</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={detectTerminals}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {terminals.length > 0 ? 'Rescan' : 'Scan'}
                  </Button>
                </div>

                {terminals.length > 0 ? (
                  <div className="space-y-2">
                    {terminals.map((terminal) => (
                      <button
                        key={terminal.terminalId}
                        onClick={() => handleTerminalSelect(terminal)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                          selectedTerminal?.terminalId === terminal.terminalId
                            ? 'border-primary bg-primary/5'
                            : 'border-border/50 hover:border-border hover:bg-muted/30'
                        )}
                      >
                        <HardDrive className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{terminal.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {terminal.dataPath}
                          </p>
                        </div>
                        {terminal.isRunning && (
                          <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
                            Running
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                ) : !loading && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Click &quot;Scan&quot; to detect installed terminals</p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'precheck':
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium text-sm">{selectedTerminal?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedTerminal?.dataPath}</p>
              </div>
            </div>

            {/* Custom Path Override */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Installation Path</h3>
                {!customPath ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectCustomPath}
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Custom Path
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCustomPath}
                  >
                    Use Auto-Detected
                  </Button>
                )}
              </div>
              
              {customPath ? (
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Custom Path Selected</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                    {customPath}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg border border-border/50 bg-muted/10">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-sm">Auto-detected path will be used</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 font-mono break-all">
                    {selectedTerminal?.dataPath}
                  </p>
                </div>
              )}
            </div>

            {/* Precheck Results */}
            {precheck && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Installation Checks</h3>
                <div className="space-y-2">
                  <PrecheckItem
                    label="Terminal Installed"
                    passed={precheck.checks.terminalInstalled}
                  />
                  <PrecheckItem
                    label="Terminal Closed"
                    passed={precheck.checks.terminalClosed}
                    warning={!precheck.checks.terminalClosed}
                    warningText="Close terminal before installing"
                  />
                  <PrecheckItem
                    label="Data Folder Writable"
                    passed={precheck.checks.dataFolderWritable}
                  />
                  <PrecheckItem
                    label="Assets Available"
                    passed={precheck.checks.assetsAvailable}
                  />
                </div>

                {precheck.messages.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside space-y-1">
                        {precheck.messages.map((msg, i) => (
                          <li key={i}>{msg}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep('select')}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={installAssets}
                disabled={!precheck?.passed || loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Install
              </Button>
            </div>

            {/* Manual Install Option */}
            <Separator />
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Having issues? Install files manually:
              </p>
              <Button variant="ghost" size="sm" onClick={openInstallFolder}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Open Data Folder
              </Button>
            </div>
          </div>
        );

      case 'installing':
        return (
          <div className="space-y-6 py-8">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h3 className="text-lg font-medium">Installing Components...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please wait while we install the required files
              </p>
            </div>
            <Progress value={installProgress} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">
              {Math.round(installProgress)}% complete
            </p>
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-6">
            {installResult?.success ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-medium">Installation Complete!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  All components have been installed successfully
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                <h3 className="text-lg font-medium">Installation Failed</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Some components could not be installed
                </p>
              </div>
            )}

            {/* Asset Results */}
            <div className="space-y-2">
              {installResult?.assets.map((result) => {
                const asset = getAssets().find(a => a.type === result.type);
                const verification = verificationResults[result.type];
                return (
                  <div
                    key={result.type}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border',
                      result.success
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-destructive/30 bg-destructive/5'
                    )}
                  >
                    {result.success ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{asset?.name}</p>
                        {verification?.verified && (
                          <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                            <Shield className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      {result.installedPath && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                          {result.installedPath}
                        </p>
                      )}
                      {result.error && (
                        <p className="text-xs text-destructive">{result.error}</p>
                      )}
                      {verification?.hash && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          SHA256: {verification.hash.slice(0, 16)}...
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Restart Notice */}
            {installResult?.restartRequired && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Please restart your terminal for changes to take effect
                </AlertDescription>
              </Alert>
            )}

            {/* Next Steps */}
            {installResult?.success && (
              <div className="space-y-3 p-4 rounded-lg bg-muted/30">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Next Steps
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Restart your terminal</li>
                  <li>Enable algorithmic trading in terminal settings</li>
                  <li>Enable DLL imports for this EA</li>
                  <li>Attach the Hedge Edge EA to a chart</li>
                  <li>Enter your license key in EA parameters</li>
                </ol>
              </div>
            )}

            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Installation Manager
          </DialogTitle>
          <DialogDescription>
            Install EA, DLL, and cBot components for automated trading
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="pr-4">
            {renderStepContent()}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface PrecheckItemProps {
  label: string;
  passed: boolean;
  warning?: boolean;
  warningText?: string;
}

function PrecheckItem({ label, passed, warning, warningText }: PrecheckItemProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/20">
      {passed ? (
        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
      ) : warning ? (
        <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
      )}
      <div className="flex-1">
        <span className="text-sm">{label}</span>
        {warning && warningText && (
          <p className="text-xs text-yellow-500">{warningText}</p>
        )}
      </div>
    </div>
  );
}
