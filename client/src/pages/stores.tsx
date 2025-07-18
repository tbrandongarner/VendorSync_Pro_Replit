import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Store, ExternalLink, Settings } from "lucide-react";

export default function Stores() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    shopifyStoreUrl: "",
    shopifyAccessToken: "",
  });

  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated,
  });

  const createStoreMutation = useMutation({
    mutationFn: async (storeData: any) => {
      const response = await apiRequest("POST", "/api/stores", storeData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsModalOpen(false);
      setFormData({ name: "", shopifyStoreUrl: "", shopifyAccessToken: "" });
      toast({
        title: "Success",
        description: "Store connected successfully",
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
        description: "Failed to connect store",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.shopifyStoreUrl) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createStoreMutation.mutate(formData);
  };

  const formatStoreUrl = (url: string) => {
    if (!url) return '';
    // Remove protocol and trailing slashes for display
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Stores" subtitle="Manage your connected Shopify stores" />
      
      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Connected Stores</h2>
            <p className="text-gray-600 mt-1">
              {stores.length} {stores.length === 1 ? 'store' : 'stores'} connected
            </p>
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" />
                Connect Store
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Connect Shopify Store</DialogTitle>
                  <DialogDescription>
                    Add a new Shopify store to sync products with your vendors.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Store Name *</Label>
                    <Input
                      id="name"
                      placeholder="My Shopify Store"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="url">Shopify Store URL *</Label>
                    <Input
                      id="url"
                      placeholder="https://mystore.myshopify.com"
                      value={formData.shopifyStoreUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, shopifyStoreUrl: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="token">Shopify Access Token</Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder="Optional - for advanced sync features"
                      value={formData.shopifyAccessToken}
                      onChange={(e) => setFormData(prev => ({ ...prev, shopifyAccessToken: e.target.value }))}
                    />
                    <p className="text-xs text-gray-500">
                      Required for automatic product sync and inventory updates
                    </p>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createStoreMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {createStoreMutation.isPending ? "Connecting..." : "Connect Store"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stores Grid */}
        {storesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="polaris-shadow">
                <CardHeader className="animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : stores.length === 0 ? (
          <Card className="polaris-shadow">
            <CardContent className="text-center py-16">
              <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No stores connected yet
              </h3>
              <p className="text-gray-600 mb-6">
                Connect your first Shopify store to start syncing products with vendors
              </p>
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Connect First Store
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>Connect Shopify Store</DialogTitle>
                      <DialogDescription>
                        Add a new Shopify store to sync products with your vendors.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Store Name *</Label>
                        <Input
                          id="name"
                          placeholder="My Shopify Store"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="url">Shopify Store URL *</Label>
                        <Input
                          id="url"
                          placeholder="https://mystore.myshopify.com"
                          value={formData.shopifyStoreUrl}
                          onChange={(e) => setFormData(prev => ({ ...prev, shopifyStoreUrl: e.target.value }))}
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="token">Shopify Access Token</Label>
                        <Input
                          id="token"
                          type="password"
                          placeholder="Optional - for advanced sync features"
                          value={formData.shopifyAccessToken}
                          onChange={(e) => setFormData(prev => ({ ...prev, shopifyAccessToken: e.target.value }))}
                        />
                        <p className="text-xs text-gray-500">
                          Required for automatic product sync and inventory updates
                        </p>
                      </div>
                    </div>
                    
                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createStoreMutation.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {createStoreMutation.isPending ? "Connecting..." : "Connect Store"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store: any) => (
              <Card key={store.id} className="polaris-shadow hover:polaris-shadow-hover transition-all">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <Store className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{store.name}</CardTitle>
                        <CardDescription className="flex items-center">
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {formatStoreUrl(store.shopifyStoreUrl)}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <Button variant="ghost" size="sm">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status</span>
                      <Badge className={getStatusColor(store.isActive)}>
                        {store.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">API Access</span>
                      <Badge variant="outline" className={store.shopifyAccessToken ? 'text-green-600' : 'text-yellow-600'}>
                        {store.shopifyAccessToken ? 'Connected' : 'Basic'}
                      </Badge>
                    </div>
                    
                    <div className="pt-2 border-t">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full text-xs"
                        onClick={() => window.open(store.shopifyStoreUrl, '_blank')}
                      >
                        <ExternalLink className="w-3 h-3 mr-2" />
                        Visit Store
                      </Button>
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Connected: {new Date(store.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
