import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import TopBar from "@/components/layout/top-bar";
import StatsCards from "@/components/dashboard/stats-cards";
import RecentVendors from "@/components/dashboard/recent-vendors";
import QuickActions from "@/components/dashboard/quick-actions";
import SyncStatus from "@/components/dashboard/sync-status";
import RecentActivity from "@/components/dashboard/recent-activity";
import AiContentGenerator from "@/components/dashboard/ai-content-generator";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

export default function Dashboard() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Initialize WebSocket connection
  useWebSocket();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Dashboard" subtitle="Manage your vendors and synchronize products" />
      
      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <StatsCards />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Vendors */}
          <div className="lg:col-span-2">
            <RecentVendors />
          </div>

          {/* Quick Actions & Sync Status */}
          <div className="space-y-6">
            <QuickActions />
            <SyncStatus />
          </div>
        </div>

        {/* Recent Activity & AI Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentActivity />
          <AiContentGenerator />
        </div>
      </div>
    </div>
  );
}
