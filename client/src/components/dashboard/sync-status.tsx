import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderSync, CheckCircle, AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

export default function SyncStatus() {
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useWebSocket();

  const { data: syncJobs = [], isLoading } = useQuery({
    queryKey: ["/api/sync/jobs"],
    enabled: isAuthenticated,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  // Handle real-time sync updates
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'sync_update') {
      queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
    }
  }, [lastMessage]);

  const getVendorName = (vendorId: number) => {
    const vendor = vendors.find((v: any) => v.id === vendorId);
    return vendor?.name || 'Unknown Vendor';
  };

  const formatProgress = (processed: number, total: number) => {
    if (total === 0) return 'Initializing...';
    return `${processed}/${total} items`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'running':
        return 'text-blue-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'running':
        return <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <div className="w-4 h-4 bg-gray-400 rounded-full" />;
    }
  };

  // Get the 3 most recent sync jobs
  const recentSyncJobs = syncJobs.slice(0, 3);

  return (
    <Card className="polaris-shadow">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">FolderSync Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Skeleton className="w-4 h-4 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        ) : recentSyncJobs.length === 0 ? (
          <div className="text-center py-8">
            <FolderSync className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No sync jobs yet</p>
            <p className="text-sm text-gray-400 mt-1">Start a sync to see status here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentSyncJobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {getVendorName(job.vendorId)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatProgress(job.processedItems, job.totalItems)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="outline" className={getStatusColor(job.status)}>
                    {job.status === 'running' && job.totalItems > 0 
                      ? `${Math.round((job.processedItems / job.totalItems) * 100)}%`
                      : job.status
                    }
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
