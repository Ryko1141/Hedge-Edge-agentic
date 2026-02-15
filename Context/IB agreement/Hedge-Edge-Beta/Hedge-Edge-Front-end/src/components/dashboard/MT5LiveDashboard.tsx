import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  useTradingFeed, 
  useTerminalStatus,
  formatCurrency, 
  formatLots, 
  formatPrice,
  type MT5Position,
} from "@/hooks/useTradingFeed";
import type { TradingPlatform } from "@/lib/local-trading-bridge";
import { 
  Loader2, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  PiggyBank,
  AlertCircle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Wifi,
  WifiOff,
  Terminal
} from "lucide-react";

/**
 * Trading Live Dashboard Component
 * Displays real-time trading data from MetaTrader 5 or cTrader
 */
export function MT5LiveDashboard() {
  const [platform, setPlatform] = useState<TradingPlatform>('mt5');
  const { snapshot, isLoading, error, isConnected, terminalRunning, lastUpdate, refresh } = useTradingFeed({ platform });
  const platformName = platform === 'mt5' ? 'MetaTrader 5' : 'cTrader';

  // Loading state
  if (isLoading && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Connecting to {platformName}...</p>
      </div>
    );
  }

  // Error state
  if (error && !snapshot) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Connection Error
            </CardTitle>
            <PlatformSelector platform={platform} onChange={setPlatform} />
          </div>
          <CardDescription>
            Failed to connect to {platformName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <p className="text-sm font-medium">Troubleshooting steps:</p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Make sure your {platformName} terminal is running on this computer</li>
              <li>Start the local trading agent for {platform.toUpperCase()}</li>
              <li>Verify the agent is running on localhost:{platform === 'mt5' ? '5101' : '5102'}</li>
              <li>Check your terminal login credentials</li>
            </ol>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Terminal className="h-4 w-4" />
            <span>Agent Status: {terminalRunning ? 'Running' : 'Not Running'}</span>
          </div>
          <Button onClick={refresh} variant="outline" className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Connection
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No data state
  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Live Trading Feed</CardTitle>
            <PlatformSelector platform={platform} onChange={setPlatform} />
          </div>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">No live feed data available.</p>
          <Button onClick={refresh} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  const profitColor = (snapshot.profit || 0) >= 0 ? "text-primary" : "text-red-500";
  const profitBg = (snapshot.profit || 0) >= 0 ? "bg-primary/10" : "bg-red-500/10";

  return (
    <div className="space-y-6">
      {/* Connection Status Bar */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <PlatformSelector platform={platform} onChange={setPlatform} />
          {isConnected ? (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <Wifi className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
              <WifiOff className="h-3 w-3 mr-1" />
              Disconnected
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {snapshot.server} • Account #{snapshot.login}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Account Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(snapshot.balance, snapshot.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Leverage: 1:{snapshot.leverage}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equity</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(snapshot.equity, snapshot.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Free Margin: {formatCurrency(snapshot.margin_free, snapshot.currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Used Margin</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(snapshot.margin, snapshot.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Margin Level: {snapshot.margin_level ? `${snapshot.margin_level.toFixed(1)}%` : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card className={profitBg}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Floating P/L</CardTitle>
            {(snapshot.profit || 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-primary" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitColor}`}>
              {formatCurrency(snapshot.profit, snapshot.currency)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {snapshot.positions_count} open position{snapshot.positions_count !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Open Positions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Open Positions
            <Badge variant="secondary" className="ml-auto">
              {snapshot.positions_count}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snapshot.positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No open positions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshot.positions.map((position: MT5Position) => (
                <PositionRow key={position.ticket} position={position} currency={snapshot.currency} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Platform Selector Component
 */
function PlatformSelector({ 
  platform, 
  onChange 
}: { 
  platform: TradingPlatform; 
  onChange: (platform: TradingPlatform) => void;
}) {
  return (
    <Tabs value={platform} onValueChange={(v) => onChange(v as TradingPlatform)}>
      <TabsList className="h-8">
        <TabsTrigger value="mt5" className="text-xs px-3">MT5</TabsTrigger>
        <TabsTrigger value="ctrader" className="text-xs px-3">cTrader</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/**
 * Position Row Component
 */
function PositionRow({ position, currency }: { position: MT5Position; currency: string }) {
  const isBuy = position.type === "BUY";
  const isProfit = position.profit >= 0;
  
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-full ${isBuy ? 'bg-primary/10' : 'bg-red-500/10'}`}>
          {isBuy ? (
            <ArrowUpRight className="h-4 w-4 text-primary" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          )}
        </div>
        <div>
          <div className="font-medium flex items-center gap-2">
            {position.symbol}
            <Badge variant={isBuy ? "default" : "destructive"} className="text-xs">
              {position.type}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            {formatLots(position.volume)} lots @ {formatPrice(position.price_open)}
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <div className="font-medium">
          {formatPrice(position.price_current)}
        </div>
        <div className={`text-sm font-medium ${isProfit ? 'text-primary' : 'text-red-500'}`}>
          {isProfit ? '+' : ''}{formatCurrency(position.profit, currency)}
        </div>
      </div>
    </div>
  );
}

export default MT5LiveDashboard;
