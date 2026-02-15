import { MT5LiveDashboard } from "@/components/dashboard/MT5LiveDashboard";

/**
 * Trading Live Feed Page
 * Displays real-time trading data from MetaTrader 5 or cTrader
 */
const MT5LiveFeed = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="text-2xl font-bold text-foreground">Live Trading Feed</h1>
        <p className="text-muted-foreground">
          Real-time account data from your local MT5 or cTrader terminal
        </p>
      </div>

      {/* Trading Dashboard Component */}
      <MT5LiveDashboard />
    </div>
  );
};

export default MT5LiveFeed;
