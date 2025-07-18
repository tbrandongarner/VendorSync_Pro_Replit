import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RotateCcw, 
  RefreshCw, 
  Upload, 
  Download, 
  ArrowUpDown, 
  Package, 
  DollarSign, 
  Image,
  Tag,
  Layers,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Settings as SettingsIcon
} from "lucide-react";

interface SyncJob {
  id: number;
  vendorId: number;
  storeId: number;
  status: string;
  progress: number;
  totalItems: number;
  processedItems: number;
  errors: string[] | null;
  startedAt: string;
  completedAt: string;
  createdAt: string;
}

interface SyncOptions {
  direction: 'push' | 'pull' | 'bidirectional';
  syncImages: boolean;
  syncInventory: boolean;
  syncPricing: boolean;
  syncTags: boolean;
  syncVariants: boolean;
  syncDescriptions: boolean;
  batchSize: number;
}

export default function SyncManager() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [syncOptions, setSyncOptions] = useState<SyncOptions>({
    direction: 'bidirectional',
    syncImages: true,
    syncInventory: true,
    syncPricing: true,
    syncTags: true,
    syncVariants: true,
    syncDescriptions: true,
    batchSize: 50,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSyncJob, setActiveSyncJob] = useState<SyncJob | null>(null);

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  const { data: syncJobs = [] } = useQuery({
    queryKey: ["/api/sync/jobs"],
    enabled: isAuthenticated,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("Connected to WebSocket for sync updates");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'sync_update') {
        setActiveSyncJob(message.data);
        queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
      }
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      socket.close();
    };
  }, [isAuthenticated]);

  const testConnectionMutation = useMutation({
    mutationFn: async (storeId: string) => {
      const response = await apiRequest("POST", `/api/stores/${storeId}/test`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Connection Test",
        description: data.success ? "Successfully connected to Shopify!" : "Connection failed",
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "Connection Test Failed",
        description: "Unable to connect to Shopify. Check your access token.",
        variant: "destructive",
      });
    },
  });

  const startSyncMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVendor || !selectedStore) {
        throw new Error("Please select both vendor and store");
      }

      const response = await apiRequest("POST", "/api/sync/start", {
        vendorId: parseInt(selectedVendor),
        storeId: parseInt(selectedStore),
        direction: syncOptions.direction,
        options: {
          syncImages: syncOptions.syncImages,
          syncInventory: syncOptions.syncInventory,
          syncPricing: syncOptions.syncPricing,
          syncTags: syncOptions.syncTags,
          syncVariants: syncOptions.syncVariants,
          syncDescriptions: syncOptions.syncDescriptions,
          batchSize: syncOptions.batchSize,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sync Started",
        description: "Product synchronization has been initiated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to start sync process",
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (params: {
      productId: number;
      type: 'inventory' | 'pricing' | 'images' | 'sync';
      data: any;
    }) => {
      const { productId, type, data } = params;
      let endpoint = `/api/products/${productId}`;
      
      switch (type) {
        case 'inventory':
          endpoint += '/inventory';
          break;
        case 'pricing':
          endpoint += '/pricing';
          break;
        case 'images':
          endpoint += '/images';
          break;
        case 'sync':
          endpoint += '/sync';
          break;
      }

      const response = await apiRequest("POST", endpoint, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Product Updated",
        description: "Product has been successfully updated in Shopify.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update product",
        variant: "destructive",
      });
    },
  });

  const handleTestConnection = async () => {
    if (!selectedStore) {
      toast({
        title: "Validation Error",
        description: "Please select a store first",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      await testConnectionMutation.mutateAsync(selectedStore);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartSync = () => {
    startSyncMutation.mutate();
  };

  const handleProductUpdate = (productId: number, type: 'inventory' | 'pricing' | 'images' | 'sync', data: any) => {
    updateProductMutation.mutate({ productId, type, data });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
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

  const selectedVendorData = vendors.find((v: any) => v.id.toString() === selectedVendor);
  const selectedStoreData = stores.find((s: any) => s.id.toString() === selectedStore);

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar 
        title="Shopify Sync Manager" 
        subtitle="Manage two-way product synchronization with your Shopify stores" 
      />
      
      <div className="p-6 space-y-6">
        <Tabs defaultValue="sync" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sync">Sync Operations</TabsTrigger>
            <TabsTrigger value="products">Product Management</TabsTrigger>
            <TabsTrigger value="history">Sync History</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sync" className="space-y-6">
            {/* Configuration */}
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <SettingsIcon className="w-5 h-5 mr-2" />
                  Sync Configuration
                </CardTitle>
                <CardDescription>
                  Configure your synchronization settings and select which data to sync
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vendor">Select Vendor</Label>
                    <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose vendor..." />
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
                    <Label htmlFor="store">Select Store</Label>
                    <Select value={selectedStore} onValueChange={setSelectedStore}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose store..." />
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direction">Sync Direction</Label>
                  <Select 
                    value={syncOptions.direction} 
                    onValueChange={(value: 'push' | 'pull' | 'bidirectional') => 
                      setSyncOptions(prev => ({ ...prev, direction: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bidirectional">
                        <div className="flex items-center">
                          <ArrowUpDown className="w-4 h-4 mr-2" />
                          Bidirectional (Push & Pull)
                        </div>
                      </SelectItem>
                      <SelectItem value="push">
                        <div className="flex items-center">
                          <Upload className="w-4 h-4 mr-2" />
                          Push to Shopify
                        </div>
                      </SelectItem>
                      <SelectItem value="pull">
                        <div className="flex items-center">
                          <Download className="w-4 h-4 mr-2" />
                          Pull from Shopify
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">Data to Sync</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Image className="w-4 h-4" />
                        <Label>Product Images</Label>
                      </div>
                      <Switch
                        checked={syncOptions.syncImages}
                        onCheckedChange={(checked) => 
                          setSyncOptions(prev => ({ ...prev, syncImages: checked }))
                        }
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4" />
                        <Label>Inventory Levels</Label>
                      </div>
                      <Switch
                        checked={syncOptions.syncInventory}
                        onCheckedChange={(checked) => 
                          setSyncOptions(prev => ({ ...prev, syncInventory: checked }))
                        }
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="w-4 h-4" />
                        <Label>Pricing</Label>
                      </div>
                      <Switch
                        checked={syncOptions.syncPricing}
                        onCheckedChange={(checked) => 
                          setSyncOptions(prev => ({ ...prev, syncPricing: checked }))
                        }
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Tag className="w-4 h-4" />
                        <Label>Tags</Label>
                      </div>
                      <Switch
                        checked={syncOptions.syncTags}
                        onCheckedChange={(checked) => 
                          setSyncOptions(prev => ({ ...prev, syncTags: checked }))
                        }
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4" />
                        <Label>Product Variants</Label>
                      </div>
                      <Switch
                        checked={syncOptions.syncVariants}
                        onCheckedChange={(checked) => 
                          setSyncOptions(prev => ({ ...prev, syncVariants: checked }))
                        }
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4" />
                        <Label>Descriptions</Label>
                      </div>
                      <Switch
                        checked={syncOptions.syncDescriptions}
                        onCheckedChange={(checked) => 
                          setSyncOptions(prev => ({ ...prev, syncDescriptions: checked }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batchSize">Batch Size</Label>
                  <Input
                    id="batchSize"
                    type="number"
                    min="1"
                    max="250"
                    value={syncOptions.batchSize}
                    onChange={(e) => 
                      setSyncOptions(prev => ({ ...prev, batchSize: parseInt(e.target.value) || 50 }))
                    }
                  />
                  <p className="text-sm text-gray-600">
                    Number of products to process in each batch (1-250)
                  </p>
                </div>

                <div className="flex space-x-4">
                  <Button 
                    onClick={handleTestConnection}
                    disabled={!selectedStore || isConnecting}
                    variant="outline"
                  >
                    {isConnecting ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                  
                  <Button 
                    onClick={handleStartSync}
                    disabled={!selectedVendor || !selectedStore || startSyncMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {startSyncMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4 mr-2" />
                    )}
                    Start Sync
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Active Sync Progress */}
            {activeSyncJob && (
              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    Active Sync Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Progress</span>
                      <span className="text-sm text-gray-600">
                        {activeSyncJob.processedItems} / {activeSyncJob.totalItems} items
                      </span>
                    </div>
                    <Progress value={activeSyncJob.progress} className="w-full" />
                    <Badge className={getStatusColor(activeSyncJob.status)}>
                      {getStatusIcon(activeSyncJob.status)}
                      {activeSyncJob.status.charAt(0).toUpperCase() + activeSyncJob.status.slice(1)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle>Product Management</CardTitle>
                <CardDescription>
                  Manage individual product synchronization and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {products.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      No products found. Start by adding vendors and running a sync.
                    </p>
                  ) : (
                    products.map((product: any) => (
                      <div key={product.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{product.name}</h3>
                            <p className="text-sm text-gray-600">{product.sku}</p>
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleProductUpdate(product.id, 'sync', { direction: 'bidirectional' })}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Sync
                            </Button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Price</Label>
                            <div className="flex space-x-2">
                              <Input
                                type="number"
                                step="0.01"
                                defaultValue={product.price}
                                placeholder="0.00"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleProductUpdate(product.id, 'pricing', { 
                                  price: parseFloat((document.querySelector('input[type="number"]') as HTMLInputElement)?.value || '0') 
                                })}
                              >
                                Update
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Inventory</Label>
                            <div className="flex space-x-2">
                              <Input
                                type="number"
                                defaultValue={product.inventory}
                                placeholder="0"
                              />
                              <Button
                                size="sm"
                                onClick={() => handleProductUpdate(product.id, 'inventory', { 
                                  quantity: parseInt((document.querySelector('input[type="number"]') as HTMLInputElement)?.value || '0') 
                                })}
                              >
                                Update
                              </Button>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Status</Label>
                            <Badge className={product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              {product.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle>Sync History</CardTitle>
                <CardDescription>
                  View recent synchronization jobs and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {syncJobs.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      No sync jobs found. Run your first sync to see history here.
                    </p>
                  ) : (
                    syncJobs.map((job: SyncJob) => (
                      <div key={job.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(job.status)}
                              <span className="font-medium">
                                Vendor {job.vendorId} → Store {job.storeId}
                              </span>
                              <Badge className={getStatusColor(job.status)}>
                                {job.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600">
                              {job.processedItems} / {job.totalItems} items processed
                            </div>
                            {job.errors && job.errors.length > 0 && (
                              <div className="text-sm text-red-600">
                                <AlertTriangle className="w-4 h-4 inline mr-1" />
                                {job.errors.length} error(s)
                              </div>
                            )}
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            {new Date(job.createdAt).toLocaleString()}
                          </div>
                        </div>
                        
                        {job.status === 'running' && (
                          <div className="mt-4">
                            <Progress value={job.progress} className="w-full" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}