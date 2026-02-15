import { Outlet } from 'react-router-dom';
import { DashboardSidebar } from './DashboardSidebar';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { CopierGroupsProvider } from '@/contexts/CopierGroupsContext';
import { TradeHistoryProvider } from '@/contexts/TradeHistoryContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// Wrapper component to use hooks
const DashboardContent = () => {
  // Enable global keyboard shortcuts
  useKeyboardShortcuts();
  
  return (
    <div className="min-h-screen flex overflow-hidden">
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export const DashboardLayout = () => {
  return (
    <SidebarProvider>
      <CopierGroupsProvider>
        <TradeHistoryProvider>
          <AnimatedBackground>
            <DashboardContent />
          </AnimatedBackground>
        </TradeHistoryProvider>
      </CopierGroupsProvider>
    </SidebarProvider>
  );
};
