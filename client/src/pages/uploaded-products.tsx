import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TopBar from "@/components/layout/top-bar";
import { SyncStatusNotification } from "@/components/ui/sync-status-notification";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Search, RefreshCw, CheckCircle, AlertCircle, Clock } from "lucide-react";

export default function UploadedProducts() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const { data: uploadedProducts = [], isLoading } = useQuery({
    queryKey: ["/api/uploaded-products"],
    enabled: isAuthenticated,
  });

  // Query sync jobs to show real-time status
  const { data: syncJobs = [] } = useQuery({
    queryKey: ["/api/sync/jobs"],
    enabled: isAuthenticated,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const syncProductMutation = useMutation({
    mutationFn: async (vendorId: number) => {
      return await apiRequest("POST", `/api/sync/vendor/${vendorId}`);
    },
    onSuccess: (data, vendorId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploaded-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
      toast({
        title: "Sync Started",
        description: `Started syncing products to Shopify. Watch for progress updates below.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to start sync",
        variant: "destructive",
      });
    },
  });

  const filteredProducts = uploadedProducts.filter((product: any) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesVendor = selectedVendor === "all" || product.vendorId.toString() === selectedVendor;
    const matchesStatus = statusFilter === "all" || product.status === statusFilter;
    
    return matchesSearch && matchesVendor && matchesStatus;
  });

  // Get sync status for vendors
  const getVendorSyncStatus = (vendorId: number) => {
    const vendorJobs = syncJobs.filter((job: any) => job.vendorId === vendorId);
    const latestJob = vendorJobs.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    
    return latestJob || null;
  };

  // Group products by vendor for better sync status display
  const productsByVendor = filteredProducts.reduce((acc: any, product: any) => {
    if (!acc[product.vendorId]) {
      acc[product.vendorId] = {
        vendor: vendors.find((v: any) => v.id === product.vendorId),
        products: []
      };
    }
    acc[product.vendorId].products.push(product);
    return acc;
  }, {});

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'synced':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'synced':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const groupedProducts = filteredProducts.reduce((acc: any, product: any) => {
    const vendorName = vendors.find((v: any) => v.id === product.vendorId)?.name || 'Unknown Vendor';
    if (!acc[vendorName]) {
      acc[vendorName] = [];
    }
    acc[vendorName].push(product);
    return acc;
  }, {});

  if (!isAuthenticated) {
    return <div>Please log in to view uploaded products.</div>;
  }

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Uploaded Products" subtitle="Manage products uploaded from vendor files" />
      
      <div className="p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex flex-col sm:flex-row gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vendors</SelectItem>
                {vendors.map((vendor: any) => (
                  <SelectItem key={vendor.id} value={vendor.id.toString()}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="synced">Synced</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Products by Vendor */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading uploaded products...</p>
          </div>
        ) : Object.keys(groupedProducts).length === 0 ? (
          <Card className="polaris-shadow">
            <CardContent className="text-center py-16">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No uploaded products found
              </h3>
              <p className="text-gray-600 mb-6">
                Upload vendor pricing sheets to see products here before syncing to Shopify
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedProducts).map(([vendorName, products]: [string, any]) => {
              const vendorId = (products as any[])[0]?.vendorId;
              const pendingCount = (products as any[]).filter(p => p.status === 'pending').length;
              
              const syncStatus = getVendorSyncStatus(vendorId);
              const isCurrentlySync = syncStatus?.status === 'running';
              
              return (
                <Card key={vendorName} className="polaris-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center space-x-2">
                          <span>{vendorName}</span>
                          <Badge variant="outline">{(products as any[]).length} products</Badge>
                        </CardTitle>
                        <CardDescription>
                          {(products as any[]).filter(p => p.status === 'synced').length} synced • {' '}
                          {(products as any[]).filter(p => p.status === 'failed').length} failed • {' '}
                          {pendingCount} pending
                        </CardDescription>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {/* Sync Status Badge */}
                        {syncStatus && (
                          <Badge 
                            variant={syncStatus.status === 'completed' ? 'default' : 
                                   syncStatus.status === 'failed' ? 'destructive' : 'secondary'}
                            className={syncStatus.status === 'running' ? 'bg-blue-100 text-blue-800' : ''}
                          >
                            {syncStatus.status === 'running' && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
                            {syncStatus.status === 'completed' && '✓ '}
                            {syncStatus.status === 'failed' && '✗ '}
                            {syncStatus.status === 'running' ? `Syncing ${syncStatus.progress || 0}%` :
                             syncStatus.status === 'completed' ? 'Sync Complete' :
                             syncStatus.status === 'failed' ? 'Sync Failed' : syncStatus.status}
                          </Badge>
                        )}
                        
                        {/* Sync Button */}
                        {pendingCount > 0 && (
                          <Button
                            onClick={() => syncProductMutation.mutate(vendorId)}
                            disabled={syncProductMutation.isPending || isCurrentlySync}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            {syncProductMutation.isPending || isCurrentlySync ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Sync {pendingCount} Products
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Progress Bar for Running Sync */}
                    {isCurrentlySync && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>{syncStatus.processedItems || 0} of {(products as any[]).length} processed</span>
                          <span>{syncStatus.progress || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${syncStatus.progress || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(products as any[]).map((product: any) => (
                        <div key={product.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center space-x-3">
                            {getStatusIcon(product.status)}
                            <div>
                              <div className="font-medium">{product.name}</div>
                              <div className="text-sm text-gray-500">
                                SKU: {product.sku} • ${product.price}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className={getStatusColor(product.status)}>
                              {product.status}
                            </Badge>
                            {product.status === 'failed' && product.syncError && (
                              <div className="text-xs text-red-600 max-w-xs truncate" title={product.syncError}>
                                {product.syncError}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        {/* Sync Status Notifications */}
        <SyncStatusNotification />
      </div>
    </div>
  );
}