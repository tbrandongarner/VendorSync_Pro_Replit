import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Download, CheckCircle2, AlertCircle, Clock, Zap } from "lucide-react";
import type { Store } from "@shared/schema";

interface BulkSyncProgress {
  totalProducts: number;
  processedProducts: number;
  updatedProducts: number;
  createdProducts: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
}

export default function BulkSync() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [syncProgress, setSyncProgress] = useState<BulkSyncProgress | null>(null);
  const [isConnectedToWebSocket, setIsConnectedToWebSocket] = useState(false);

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated,
  });

  // WebSocket connection for real-time progress
  useEffect(() => {
    if (!isAuthenticated) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);

      ws.onopen = () => {
        console.log("WebSocket connected for bulk sync");
        setIsConnectedToWebSocket(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'bulk_sync_progress') {
            setSyncProgress(message.data);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnectedToWebSocket(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnectedToWebSocket(false);
      };

      return ws;
    };

    const ws = connectWebSocket();

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [isAuthenticated]);

  const bulkSyncMutation = useMutation({
    mutationFn: async () => {
      const storeId = selectedStore === "all" ? undefined : parseInt(selectedStore);
      
      const response = await fetch("/api/sync/bulk-from-shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start bulk sync");
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Sync Started",
        description: "Synchronization is running in the background. You'll see progress updates below.",
      });
      
      setSyncProgress(data.progress);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: Error) => {
      console.error("Bulk sync error:", error);
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getProgressPercentage = () => {
    if (!syncProgress || syncProgress.totalProducts === 0) return 0;
    return Math.round((syncProgress.processedProducts / syncProgress.totalProducts) * 100);
  };

  const getStatusIcon = () => {
    if (!syncProgress) return <Clock className="w-4 h-4" />;
    
    switch (syncProgress.status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatDuration = () => {
    if (!syncProgress) return "";
    
    const start = new Date(syncProgress.startTime);
    const end = syncProgress.endTime ? new Date(syncProgress.endTime) : new Date();
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  if (!isAuthenticated) {
    return <div>Please log in to access bulk synchronization.</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Bulk Synchronization</h1>
        <p className="text-gray-600">
          Sync all products from Shopify to VendorSync Pro. This will update existing products and create new ones based on your Shopify inventory.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Sync Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Sync Configuration
            </CardTitle>
            <CardDescription>
              Choose which stores to synchronize from Shopify
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Store Selection
                </label>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stores to sync" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id.toString()}>
                        {store.shopDomain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => bulkSyncMutation.mutate()}
                  disabled={bulkSyncMutation.isPending || syncProgress?.status === 'running'}
                  className="flex items-center gap-2"
                >
                  {bulkSyncMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {syncProgress?.status === 'running' ? "Syncing..." : "Start Bulk Sync"}
                </Button>
                
                <Badge variant={isConnectedToWebSocket ? "default" : "secondary"}>
                  {isConnectedToWebSocket ? "Connected" : "Disconnected"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync Progress */}
        {syncProgress && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon()}
                Sync Progress
              </CardTitle>
              <CardDescription>
                Real-time synchronization status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Progress</span>
                    <span>
                      {syncProgress.processedProducts} / {syncProgress.totalProducts} products
                    </span>
                  </div>
                  <Progress value={getProgressPercentage()} className="w-full" />
                  <div className="text-xs text-gray-500 mt-1">
                    {getProgressPercentage()}% complete
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {syncProgress.totalProducts}
                    </div>
                    <div className="text-sm text-gray-500">Total</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {syncProgress.createdProducts}
                    </div>
                    <div className="text-sm text-gray-500">Created</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-600">
                      {syncProgress.updatedProducts}
                    </div>
                    <div className="text-sm text-gray-500">Updated</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {syncProgress.errors.length}
                    </div>
                    <div className="text-sm text-gray-500">Errors</div>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between items-center text-sm text-gray-500">
                  <div>Status: <Badge variant="outline">{syncProgress.status}</Badge></div>
                  <div>Duration: {formatDuration()}</div>
                </div>

                {/* Error List */}
                {syncProgress.errors.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2 text-red-600">Errors:</h4>
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 max-h-32 overflow-y-auto">
                      {syncProgress.errors.slice(0, 10).map((error, index) => (
                        <div key={index} className="text-xs text-red-700 mb-1">
                          • {error}
                        </div>
                      ))}
                      {syncProgress.errors.length > 10 && (
                        <div className="text-xs text-red-600 font-medium">
                          ... and {syncProgress.errors.length - 10} more errors
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p>
                <strong>1. Fetch Products:</strong> The system connects to your Shopify stores and fetches all product data including variants, images, and metadata.
              </p>
              <p>
                <strong>2. Smart Matching:</strong> Products are matched by Shopify ID or SKU to determine if they should be updated or created as new entries.
              </p>
              <p>
                <strong>3. Data Synchronization:</strong> Product information is updated in your VendorSync database with the latest data from Shopify.
              </p>
              <p>
                <strong>4. Real-time Updates:</strong> Progress is displayed in real-time via WebSocket connection, showing detailed statistics and any errors.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}