/**
 * Sidebar License Status Widget
 * 
 * Compact license status indicator for sidebar display with:
 * - Tier badge
 * - Expiry countdown
 * - Connected agents count
 * - Quick status at a glance
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLicense, type LicenseTier } from '@/contexts/LicenseContext';
import {
  Key,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Crown,
  Star,
  Zap,
  Activity,
  Clock,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface LicenseStatusProps {
  /** Show full details or just icon */
  variant?: 'full' | 'compact' | 'icon-only';
  /** Additional CSS classes */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTierInfo(tier: LicenseTier | null): {
  icon: typeof Crown;
  color: string;
  bgColor: string;
  label: string;
} {
  switch (tier) {
    case 'enterprise':
      return {
        icon: Crown,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
        label: 'Enterprise',
      };
    case 'professional':
      return {
        icon: Star,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        label: 'Pro',
      };
    case 'demo':
    default:
      return {
        icon: Zap,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/30',
        label: 'Demo',
      };
  }
}

function getStatusIcon(status: string | undefined, isLoading: boolean) {
  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  switch (status) {
    case 'valid':
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    case 'expired':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'invalid':
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case 'checking':
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    default:
      return <Key className="h-4 w-4 text-muted-foreground" />;
  }
}

// ============================================================================
// Component
// ============================================================================

export function LicenseStatus({
  variant = 'full',
  className,
  onClick,
}: LicenseStatusProps) {
  const {
    license,
    connectedAgents,
    isLoading,
    isValid,
    isExpired,
    isExpiringSoon,
    tier,
  } = useLicense();

  const tierInfo = getTierInfo(tier);
  const TierIcon = tierInfo.icon;

  // Determine overall status
  const status = license?.status || 'not-configured';
  const StatusIcon = getStatusIcon(status, isLoading);

  // Tooltip content
  const tooltipContent = (
    <div className="space-y-2 text-xs">
      <div className="font-medium">
        {isValid ? `${tierInfo.label} License` : 'No License'}
      </div>
      {isValid && license && (
        <>
          {license.maskedKey && (
            <div className="text-muted-foreground">{license.maskedKey}</div>
          )}
          {license.daysRemaining !== undefined && (
            <div className={cn(
              "flex items-center gap-1",
              isExpiringSoon ? "text-yellow-500" : "text-muted-foreground"
            )}>
              <Clock className="h-3 w-3" />
              {license.daysRemaining} days remaining
            </div>
          )}
          {connectedAgents.length > 0 && (
            <div className="flex items-center gap-1 text-green-500">
              <Activity className="h-3 w-3" />
              {connectedAgents.length} agent{connectedAgents.length !== 1 ? 's' : ''} connected
            </div>
          )}
        </>
      )}
      {status === 'not-configured' && (
        <div className="text-muted-foreground">Click to add license</div>
      )}
      {isExpired && (
        <div className="text-destructive">License has expired</div>
      )}
    </div>
  );

  // Icon-only variant
  if (variant === 'icon-only') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-md",
                "transition-colors hover:bg-muted/50",
                className
              )}
            >
              {isValid ? (
                <TierIcon className={cn("h-5 w-5", tierInfo.color)} />
              ) : (
                StatusIcon
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md",
                "transition-colors hover:bg-muted/50",
                className
              )}
            >
              {isValid ? (
                <TierIcon className={cn("h-4 w-4", tierInfo.color)} />
              ) : (
                StatusIcon
              )}
              <span className="text-xs font-medium">
                {isValid ? tierInfo.label : 'Unlicensed'}
              </span>
              {isExpiringSoon && (
                <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
              )}
              {connectedAgents.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                  {connectedAgents.length}
                </Badge>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full variant
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 w-full p-3 rounded-lg",
              "transition-colors hover:bg-muted/50",
              "border border-transparent",
              isValid && "border-primary/20 bg-primary/5",
              isExpiringSoon && "border-yellow-500/30 bg-yellow-500/5",
              isExpired && "border-destructive/30 bg-destructive/5",
              className
            )}
          >
            {/* Icon */}
            <div className={cn(
              "flex items-center justify-center h-10 w-10 rounded-lg",
              isValid ? tierInfo.bgColor : "bg-muted/30"
            )}>
              {isValid ? (
                <TierIcon className={cn("h-5 w-5", tierInfo.color)} />
              ) : (
                StatusIcon
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {isValid ? `${tierInfo.label} License` : 'No License'}
                </span>
                {isExpiringSoon && (
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {isValid && license?.daysRemaining !== undefined
                  ? `${license.daysRemaining}d remaining`
                  : isExpired
                    ? 'License expired'
                    : 'Click to activate'
                }
              </div>
            </div>

            {/* Connected agents indicator */}
            {connectedAgents.length > 0 && (
              <div className="flex items-center gap-1 text-green-500">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium">{connectedAgents.length}</span>
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px]">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default LicenseStatus;
