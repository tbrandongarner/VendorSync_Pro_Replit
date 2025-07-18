import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderSync, Play, Pause, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { useEffect } from "react";

export default function Synchronization() {
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useWebSocket();
  const { toast } = useToast();
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [selectedStore, setSelectedStore] = useState<string>("");

  const { data: syncJobs = [], isLoading: syncJobsLoading } = useQuery({
    queryKey: ["/api/sync/jobs"],
    enabled: isAuthenticated,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated,
  });

  const startSyncMutation = useMutation({
    mutationFn: async ({ vendorId, storeId }: { vendorId: number; storeId: number }) => {
      const response = await apiRequest("POST", "/api/sync/start", { vendorId, storeId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
      toast({
        title: "FolderSync Started",
        description: "Product synchronization has been initiated",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: "Failed to start synchronization",
        variant: "destructive",
      });
    },
  });

  // Handle WebSocket sync updates
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'sync_update') {
      queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
    }
  }, [lastMessage]);

  const handleStartSync = () => {
    if (!selectedVendor || !selectedStore) {
      toast({
        title: "Selection Required",
        description: "Please select both a vendor and store to sync",
        variant: "destructive",
      });
      return;
    }

    startSyncMutation.mutate({
      vendorId: parseInt(selectedVendor),
      storeId: parseInt(selectedStore),
    });
  };

  const getVendorName = (vendorId: number) => {
    const vendor = vendors.find((v: any) => v.id === vendorId);
    return vendor?.name || 'Unknown Vendor';
  };

  const getStoreName = (storeId: number) => {
    const store = stores.find((s: any) => s.id === storeId);
    return store?.name || 'Unknown Store';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Pause className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatDuration = (start: string, end?: string) => {
    const startTime = new Date(start);
    const endTime = end ? new Date(end) : new Date();
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Synchronization" subtitle="Monitor and manage product sync jobs" />
      
      <div className="p-6 space-y-6">
        {/* Start New FolderSync */}
        <Card className="polaris-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <FolderSync className="w-5 h-5 mr-2 text-emerald-600" />
              Start New Synchronization
            </CardTitle>
            <CardDescription>
              FolderSync products from a vendor to a specific store
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Vendor</label>
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor: any) => (
                      <SelectItem key={vendor.id} value={vendor.id.toString()}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Select Store</label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store: any) => (
                      <SelectItem key={store.id} value={store.id.toString()}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={handleStartSync}
                disabled={startSyncMutation.isPending || !selectedVendor || !selectedStore}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Play className="w-4 h-4 mr-2" />
                {startSyncMutation.isPending ? "Starting..." : "Start FolderSync"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* FolderSync Jobs */}
        <Card className="polaris-shadow">
          <CardHeader>
            <CardTitle>FolderSync Jobs</CardTitle>
            <CardDescription>
              Recent and ongoing synchronization activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {syncJobsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </div>
                      <div className="w-20 h-6 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : syncJobs.length === 0 ? (
              <div className="text-center py-12">
                <FolderSync className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No sync jobs yet
                </h3>
                <p className="text-gray-600">
                  Start your first synchronization to see jobs here
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {syncJobs.map((job: any) => (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      {getStatusIcon(job.status)}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium text-gray-900">
                            {getVendorName(job.vendorId)} → {getStoreName(job.storeId)}
                          </h4>
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          {job.processedItems} of {job.totalItems} items processed
                          {job.startedAt && (
                            <span className="ml-2">
                              • {formatDuration(job.startedAt, job.completedAt)}
                            </span>
                          )}
                        </div>
                        
                        {job.status === 'running' && job.totalItems > 0 && (
                          <div className="mt-2 max-w-xs">
                            <Progress 
                              value={(job.processedItems / job.totalItems) * 100} 
                              className="h-2"
                            />
                          </div>
                        )}
                        
                        {job.errors && Object.keys(job.errors).length > 0 && (
                          <div className="mt-2 text-xs text-red-600">
                            {Object.keys(job.errors).length} error(s) occurred
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-500">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Jobs</p>
                  <p className="text-2xl font-semibold text-gray-900">{syncJobs.length}</p>
                </div>
                <FolderSync className="w-8 h-8 text-emerald-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Running</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {syncJobs.filter((job: any) => job.status === 'running').length}
                  </p>
                </div>
                <RefreshCw className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {syncJobs.filter((job: any) => job.status === 'completed').length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
