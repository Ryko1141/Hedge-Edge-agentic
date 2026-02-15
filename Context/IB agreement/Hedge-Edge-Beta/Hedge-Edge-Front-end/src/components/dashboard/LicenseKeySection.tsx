import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/desktop';
import { useToast } from '@/hooks/use-toast';
import {
  Key,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Clock,
  Calendar,
  Shield,
  Trash2,
  Lock,
  LockOpen,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import type { LicenseInfo, LicenseStatus } from '@/types/connections';

// ============================================================================
// Types
// ============================================================================

interface LicenseKeySectionProps {
  /** Current license info (from connection supervisor or global state) */
  licenseInfo?: LicenseInfo | null;
  /** Callback when license key is updated */
  onLicenseUpdate?: (licenseKey: string) => Promise<{ success: boolean; license?: LicenseInfo; error?: string }>;
  /** Callback to refresh license status */
  onRefresh?: () => Promise<void>;
  /** Callback to remove license */
  onRemove?: () => Promise<{ success: boolean; error?: string }>;
  /** Whether secure storage (OS keychain) is available */
  secureStorageAvailable?: boolean;
  /** Show in compact mode */
  compact?: boolean;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getLicenseStatusConfig(status: LicenseStatus): {
  icon: typeof CheckCircle2;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
} {
  switch (status) {
    case 'valid':
      return {
        icon: CheckCircle2,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/30',
        label: 'Licensed',
      };
    case 'expired':
      return {
        icon: AlertTriangle,
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        label: 'Expired',
      };
    case 'invalid':
      return {
        icon: XCircle,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        borderColor: 'border-destructive/30',
        label: 'Invalid',
      };
    case 'checking':
      return {
        icon: Loader2,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
        borderColor: 'border-border',
        label: 'Checking...',
      };
    case 'error':
      return {
        icon: AlertTriangle,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
        borderColor: 'border-destructive/30',
        label: 'Error',
      };
    case 'not-configured':
    default:
      return {
        icon: Key,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
        borderColor: 'border-border',
        label: 'Not Configured',
      };
  }
}

function formatDate(isoString?: string): string {
  if (!isoString) return 'Unknown';
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Unknown';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    
    if (diffMins < 0) {
      const absMins = Math.abs(diffMins);
      if (absMins < 60) return `${absMins}m ago`;
      if (absMins < 1440) return `${Math.round(absMins / 60)}h ago`;
      return `${Math.round(absMins / 1440)}d ago`;
    } else {
      if (diffMins < 60) return `in ${diffMins}m`;
      if (diffMins < 1440) return `in ${Math.round(diffMins / 60)}h`;
      return `in ${Math.round(diffMins / 1440)}d`;
    }
  } catch {
    return 'Unknown';
  }
}

// ============================================================================
// Component
// ============================================================================

export function LicenseKeySection({
  licenseInfo,
  onLicenseUpdate,
  onRefresh,
  onRemove,
  secureStorageAvailable,
  compact = false,
  className,
}: LicenseKeySectionProps) {
  // State
  const [licenseKey, setLicenseKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [actualKey, setActualKey] = useState<string | null>(null);
  const [isFetchingKey, setIsFetchingKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const status = licenseInfo?.status || 'not-configured';
  const config = getLicenseStatusConfig(status);
  const StatusIcon = config.icon;

  // Handle license key submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim() || !onLicenseUpdate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onLicenseUpdate(licenseKey.trim());
      if (result.success) {
        setLicenseKey('');
        toast({
          title: "License Activated! 🎉",
          description: "Your license has been validated successfully. All features are now unlocked.",
        });
      } else {
        setError(result.error || 'Failed to validate license');
        toast({
          variant: "destructive",
          title: "License Validation Failed",
          description: result.error || 'Please check your license key and try again.',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [licenseKey, onLicenseUpdate, toast]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      toast({
        title: "License Refreshed",
        description: "Your license status has been updated.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Could not refresh license status. Please try again.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh, toast]);

  // Handle remove
  const handleRemove = useCallback(async () => {
    if (!onRemove) return;
    if (!confirm('Are you sure you want to remove your license key?')) return;
    
    setIsSubmitting(true);
    try {
      const result = await onRemove();
      if (result.success) {
        toast({
          title: "License Removed",
          description: "Your license key has been removed from this device.",
        });
      } else {
        setError(result.error || 'Failed to remove license');
        toast({
          variant: "destructive",
          title: "Remove Failed",
          description: result.error || 'Failed to remove license',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [onRemove, toast]);

  // Fetch the actual license key from secure storage
  const fetchActualKey = useCallback(async (): Promise<string | null> => {
    if (!isElectron()) return null;
    
    setIsFetchingKey(true);
    try {
      const result = await window.electronAPI.license.getKey();
      if (result.success && result.data) {
        setActualKey(result.data);
        return result.data;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch license key:', err);
      return null;
    } finally {
      setIsFetchingKey(false);
    }
  }, []);

  // Toggle show/hide key
  const handleToggleShowKey = useCallback(async () => {
    if (!showKey && !actualKey) {
      // Fetch the key when showing for the first time
      await fetchActualKey();
    }
    setShowKey(!showKey);
  }, [showKey, actualKey, fetchActualKey]);

  // Copy actual license key
  const copyLicenseKey = useCallback(async () => {
    let keyToCopy = actualKey;
    
    // If we don't have the actual key yet, fetch it
    if (!keyToCopy && isElectron()) {
      keyToCopy = await fetchActualKey();
    }
    
    if (keyToCopy) {
      await navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "License key copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not retrieve license key.",
      });
    }
  }, [actualKey, fetchActualKey, toast]);

  // Compact view for inline display
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Badge
          variant="outline"
          className={cn(
            'text-xs',
            config.bgColor,
            config.color,
            config.borderColor
          )}
        >
          {status === 'checking' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {config.label}
        </Badge>
        {licenseInfo?.daysRemaining != null && status === 'valid' && (
          <span className="text-xs text-muted-foreground">
            {licenseInfo.daysRemaining}d remaining
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className={cn('border-border/50 bg-card/50', className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              License Key
            </CardTitle>
            <CardDescription>
              Manage your Hedge Edge subscription license
            </CardDescription>
          </div>
          {/* Secure Storage Indicator */}
          <div className="flex items-center gap-1.5">
            {secureStorageAvailable ? (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                <Lock className="h-3 w-3 mr-1" />
                Keychain Protected
              </Badge>
            ) : secureStorageAvailable === false ? (
              <Badge variant="outline" className="text-[10px] text-yellow-500 border-yellow-500/30 bg-yellow-500/5">
                <LockOpen className="h-3 w-3 mr-1" />
                Memory Only
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current License Status */}
        <div className={cn(
          'p-4 rounded-lg border',
          config.bgColor,
          config.borderColor
        )}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={cn(
                'h-8 w-8',
                config.color,
                status === 'checking' && 'animate-spin'
              )} />
              <div>
                <p className={cn('font-semibold', config.color)}>
                  {config.label}
                </p>
                {licenseInfo?.maskedKey && (
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs bg-background/50 px-2 py-0.5 rounded">
                      {showKey && actualKey ? actualKey : (showKey ? licenseInfo.maskedKey : '••••-••••-••••-••••')}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleToggleShowKey}
                      disabled={isFetchingKey}
                    >
                      {isFetchingKey ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : showKey ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={copyLicenseKey}
                      disabled={isFetchingKey}
                    >
                      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
                {licenseInfo?.errorMessage && (
                  <p className="text-xs text-destructive mt-1">
                    {licenseInfo.errorMessage}
                  </p>
                )}
              </div>
            </div>
            {status !== 'not-configured' && onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              </Button>
            )}
          </div>

          {/* License Details */}
          {licenseInfo && status !== 'not-configured' && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/30">
              {licenseInfo.tier && (
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="text-sm font-medium capitalize">{licenseInfo.tier}</p>
                  </div>
                </div>
              )}
              {licenseInfo.expiresAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Expires</p>
                    <p className="text-sm font-medium">{formatDate(licenseInfo.expiresAt)}</p>
                  </div>
                </div>
              )}
              {licenseInfo.lastChecked && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Verified</p>
                    <p className="text-sm font-medium">{formatRelativeTime(licenseInfo.lastChecked)}</p>
                  </div>
                </div>
              )}
              {licenseInfo.nextCheckAt && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Next Check</p>
                    <p className="text-sm font-medium">{formatRelativeTime(licenseInfo.nextCheckAt)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Features (if available) */}
          {licenseInfo?.features && licenseInfo.features.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-2">Enabled Features</p>
              <div className="flex flex-wrap gap-1">
                {licenseInfo.features.map((feature) => (
                  <Badge key={feature} variant="secondary" className="text-[10px]">
                    {feature}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Enter/Update License Key Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="license-key">
              {status === 'not-configured' ? 'Enter License Key' : 'Update License Key'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="license-key"
                type="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                className="font-mono"
                disabled={isSubmitting}
              />
              <Button type="submit" disabled={!licenseKey.trim() || isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Activate'
                )}
              </Button>
            </div>
          </div>
          
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>

        {/* Remove License */}
        {status !== 'not-configured' && onRemove && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Remove License</p>
                <p className="text-xs text-muted-foreground">
                  Remove your license key from this device
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={isSubmitting}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Inline License Status Badge
// ============================================================================

interface LicenseStatusBadgeProps {
  status: LicenseStatus;
  daysRemaining?: number;
  className?: string;
  showLabel?: boolean;
}

export function LicenseStatusBadge({
  status,
  daysRemaining,
  className,
  showLabel = true,
}: LicenseStatusBadgeProps) {
  const config = getLicenseStatusConfig(status);
  const StatusIcon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-xs gap-1',
        config.bgColor,
        config.color,
        config.borderColor,
        className
      )}
    >
      <StatusIcon className={cn(
        'h-3 w-3',
        status === 'checking' && 'animate-spin'
      )} />
      {showLabel && <span>{config.label}</span>}
      {status === 'valid' && daysRemaining != null && daysRemaining <= 30 && (
        <span className="opacity-70">({daysRemaining}d)</span>
      )}
    </Badge>
  );
}
