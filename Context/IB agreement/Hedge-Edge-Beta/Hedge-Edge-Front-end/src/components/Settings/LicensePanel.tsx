/**
 * License Panel Component
 * 
 * Full license management UI with:
 * - License key activation
 * - Tier/plan display
 * - Device management
 * - Connected agents display
 * - Expiry countdown
 */

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useLicense, type DeviceInfo, type ConnectedAgent, type LicenseTier } from '@/contexts/LicenseContext';
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
  Monitor,
  Smartphone,
  Server,
  Users,
  Activity,
  Crown,
  Star,
  Zap,
  Info,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface LicensePanelProps {
  className?: string;
  compact?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTierConfig(tier: LicenseTier | null): {
  icon: typeof Crown;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  description: string;
} {
  switch (tier) {
    case 'enterprise':
      return {
        icon: Crown,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        label: 'Enterprise',
        description: 'Unlimited features and priority support',
      };
    case 'professional':
      return {
        icon: Star,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/30',
        label: 'Professional',
        description: 'Full trading and analytics features',
      };
    case 'demo':
    default:
      return {
        icon: Zap,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
        borderColor: 'border-border',
        label: 'Demo',
        description: 'Limited trial features',
      };
  }
}

function getDeviceIcon(platform: string) {
  switch (platform) {
    case 'desktop':
      return Monitor;
    case 'mt5':
    case 'mt4':
      return Server;
    case 'ctrader':
      return Activity;
    default:
      return Smartphone;
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
// Sub-Components
// ============================================================================

interface DeviceListProps {
  devices: DeviceInfo[];
  onDeactivate: (deviceId: string) => Promise<void>;
  isLoading: boolean;
}

function DeviceList({ devices, onDeactivate, isLoading }: DeviceListProps) {
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const handleDeactivate = async (deviceId: string) => {
    setDeactivatingId(deviceId);
    try {
      await onDeactivate(deviceId);
    } finally {
      setDeactivatingId(null);
    }
  };

  if (devices.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Monitor className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No devices registered</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[200px]">
      <div className="space-y-2">
        {devices.map((device) => {
          const DeviceIcon = getDeviceIcon(device.platform);
          const isDeactivating = deactivatingId === device.deviceId;
          
          return (
            <div
              key={device.deviceId}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                device.isCurrentDevice 
                  ? "bg-primary/5 border-primary/20" 
                  : "bg-muted/20 border-border/50"
              )}
            >
              <div className="flex items-center gap-3">
                <DeviceIcon className={cn(
                  "h-5 w-5",
                  device.isCurrentDevice ? "text-primary" : "text-muted-foreground"
                )} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm capitalize">
                      {device.platform}
                    </span>
                    {device.isCurrentDevice && (
                      <Badge variant="secondary" className="text-xs">
                        This device
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last seen: {formatRelativeTime(device.lastSeenAt)}
                  </div>
                </div>
              </div>
              {!device.isCurrentDevice && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeactivate(device.deviceId)}
                  disabled={isDeactivating || isLoading}
                  className="text-destructive hover:text-destructive"
                >
                  {isDeactivating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

interface AgentListProps {
  agents: ConnectedAgent[];
}

function AgentList({ agents }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No agents connected</p>
        <p className="text-xs mt-1">Start an EA or cBot to connect</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[200px]">
      <div className="space-y-2">
        {agents.map((agent) => {
          const AgentIcon = getDeviceIcon(agent.platform);
          
          return (
            <div
              key={agent.id}
              className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <AgentIcon className="h-5 w-5 text-green-500" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm uppercase">
                      {agent.platform}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      #{agent.accountId}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Connected {formatRelativeTime(agent.connectedAt)}
                  </div>
                </div>
              </div>
              <Badge variant="outline" className="text-green-500 border-green-500/30">
                Active
              </Badge>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LicensePanel({ className, compact = false }: LicensePanelProps) {
  const { toast } = useToast();
  const {
    license,
    devices,
    connectedAgents,
    isLoading,
    error,
    isValid,
    isExpired,
    isExpiringSoon,
    tier,
    activate,
    refresh,
    remove,
    deactivateDevice,
    loadDevices,
  } = useLicense();

  // Local state
  const [licenseKey, setLicenseKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const tierConfig = getTierConfig(tier);
  const TierIcon = tierConfig.icon;

  // License key format validation
  const formatLicenseKey = (value: string): string => {
    // Remove non-alphanumeric characters and convert to uppercase
    const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Add dashes every 4 characters
    const parts = cleaned.match(/.{1,4}/g) || [];
    return parts.slice(0, 4).join('-');
  };

  // Handle license key input
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseKey(e.target.value);
    setLicenseKey(formatted);
    setInputError(null);
  };

  // Handle activation
  const handleActivate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!licenseKey.trim() || licenseKey.length < 19) {
      setInputError('Please enter a valid license key (XXXX-XXXX-XXXX-XXXX)');
      return;
    }

    setIsSubmitting(true);
    setInputError(null);

    try {
      const result = await activate(licenseKey);
      
      if (result.success) {
        setLicenseKey('');
        toast({
          title: 'License Activated! 🎉',
          description: 'Your license has been validated successfully.',
        });
      } else {
        setInputError(result.error || 'Activation failed');
        toast({
          title: 'Activation Failed',
          description: result.error,
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [licenseKey, activate, toast]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
      await loadDevices();
      toast({
        title: 'License Refreshed',
        description: 'License status updated successfully.',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [refresh, loadDevices, toast]);

  // Handle remove
  const handleRemove = useCallback(async () => {
    const result = await remove();
    if (result.success) {
      toast({
        title: 'License Removed',
        description: 'Your license has been deactivated.',
      });
    } else {
      toast({
        title: 'Failed to Remove',
        description: result.error,
        variant: 'destructive',
      });
    }
  }, [remove, toast]);

  // Handle device deactivation
  const handleDeactivateDevice = useCallback(async (deviceId: string) => {
    const result = await deactivateDevice(deviceId);
    if (result.success) {
      toast({
        title: 'Device Removed',
        description: 'Device has been deactivated from your license.',
      });
    } else {
      toast({
        title: 'Failed to Remove Device',
        description: result.error,
        variant: 'destructive',
      });
    }
  }, [deactivateDevice, toast]);

  // Calculate expiry progress
  const expiryProgress = license?.daysRemaining !== undefined && license.daysRemaining <= 30
    ? Math.max(0, (license.daysRemaining / 30) * 100)
    : 100;

  return (
    <Card className={cn("border-border/50 bg-card/50", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>License Management</CardTitle>
          </div>
          {isValid && (
            <Badge className={cn(tierConfig.bgColor, tierConfig.color, "border-0")}>
              <TierIcon className="h-3 w-3 mr-1" />
              {tierConfig.label}
            </Badge>
          )}
        </div>
        <CardDescription>
          {isValid 
            ? tierConfig.description 
            : 'Enter your license key to unlock all features'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Expiry Warning */}
        {isExpiringSoon && license?.daysRemaining !== undefined && (
          <Alert variant="destructive" className="border-yellow-500/50 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-500">License Expiring Soon</AlertTitle>
            <AlertDescription>
              Your license expires in {license.daysRemaining} day{license.daysRemaining !== 1 ? 's' : ''}.
              Please renew to avoid service interruption.
            </AlertDescription>
          </Alert>
        )}

        {/* Current License Status */}
        {isValid && license && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="font-medium">{license.maskedKey || 'Licensed'}</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={isRefreshing || isLoading}
                    >
                      <RefreshCw className={cn(
                        "h-4 w-4",
                        isRefreshing && "animate-spin"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh Status</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Expiry Info */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{formatDate(license.expiresAt)}</span>
              </div>
              {license.daysRemaining !== undefined && license.daysRemaining <= 30 && (
                <Progress value={expiryProgress} className="h-2" />
              )}
            </div>

            {/* Features */}
            {license.features && license.features.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Features</Label>
                <div className="flex flex-wrap gap-1">
                  {license.features.map((feature) => (
                    <Badge key={feature} variant="secondary" className="text-xs">
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* License Key Input (when not licensed) */}
        {!isValid && (
          <form onSubmit={handleActivate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="license-key">License Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="license-key"
                    type={showKey ? 'text' : 'password'}
                    value={licenseKey}
                    onChange={handleKeyChange}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    className={cn(
                      "font-mono pr-10",
                      inputError && "border-destructive"
                    )}
                    maxLength={19}
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button type="submit" disabled={isSubmitting || licenseKey.length < 19}>
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Activate'
                  )}
                </Button>
              </div>
              {inputError && (
                <p className="text-xs text-destructive">{inputError}</p>
              )}
            </div>
          </form>
        )}

        {/* Tabs for Devices/Agents */}
        {isValid && !compact && (
          <Tabs defaultValue="devices" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="devices" className="text-xs">
                <Monitor className="h-3 w-3 mr-1" />
                Devices ({devices.length})
              </TabsTrigger>
              <TabsTrigger value="agents" className="text-xs">
                <Activity className="h-3 w-3 mr-1" />
                Agents ({connectedAgents.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="devices" className="mt-4">
              <DeviceList
                devices={devices}
                onDeactivate={handleDeactivateDevice}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="agents" className="mt-4">
              <AgentList agents={connectedAgents} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* Footer Actions */}
      {isValid && (
        <CardFooter className="flex justify-between border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Stored in OS keychain
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Remove License
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default LicensePanel;
