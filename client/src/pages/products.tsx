import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Box, Filter, ExternalLink } from "lucide-react";

export default function Products() {
  const { isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [selectedStore, setSelectedStore] = useState<string>("all");

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["/api/products"],
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

  const filteredProducts = products.filter((product: any) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesVendor = selectedVendor === "all" || product.vendorId.toString() === selectedVendor;
    const matchesStore = selectedStore === "all" || product.storeId.toString() === selectedStore;
    
    return matchesSearch && matchesVendor && matchesStore;
  });

  const getVendorName = (vendorId: number) => {
    const vendor = vendors.find((v: any) => v.id === vendorId);
    return vendor?.name || 'Unknown Vendor';
  };

  const getStoreName = (storeId: number) => {
    const store = stores.find((s: any) => s.id === storeId);
    return store?.name || 'Unknown Store';
  };

  const formatPrice = (price: string | number) => {
    if (!price) return 'N/A';
    return `$${parseFloat(price.toString()).toFixed(2)}`;
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Products" subtitle="Manage your synchronized products across all vendors" />
      
      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card className="polaris-shadow">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="w-5 h-5 mr-2" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                <SelectTrigger>
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

              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger>
                  <SelectValue placeholder="All Stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores</SelectItem>
                  {stores.map((store: any) => (
                    <SelectItem key={store.id} value={store.id.toString()}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm("");
                  setSelectedVendor("all");
                  setSelectedStore("all");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Products Grid */}
        {productsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="polaris-shadow">
                <CardHeader className="animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardHeader>
                <CardContent className="animate-pulse">
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <Card className="polaris-shadow">
            <CardContent className="text-center py-16">
              <Box className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm || (selectedVendor !== "all") || (selectedStore !== "all") ? 'No products found' : 'No products synced yet'}
              </h3>
              <p className="text-gray-600">
                {searchTerm || (selectedVendor !== "all") || (selectedStore !== "all")
                  ? 'Try adjusting your filters or search terms'
                  : 'Products will appear here once vendors start syncing their catalogs'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product: any) => (
              <Card key={product.id} className="polaris-shadow hover:polaris-shadow-hover transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{product.name}</CardTitle>
                      <CardDescription>
                        {getVendorName(product.vendorId)} • {getStoreName(product.storeId)}
                      </CardDescription>
                    </div>
                    <Badge className={getStatusColor(product.isActive)}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    {product.sku && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">SKU</span>
                        <span className="text-sm font-mono">{product.sku}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Price</span>
                      <span className="text-sm font-medium">{formatPrice(product.price)}</span>
                    </div>
                    
                    {product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price || 0) && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Compare at</span>
                        <span className="text-sm text-gray-500 line-through">{formatPrice(product.compareAtPrice)}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Inventory</span>
                      <span className="text-sm font-medium">{product.inventory || 0}</span>
                    </div>
                    
                    {product.category && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Category</span>
                        <Badge variant="outline" className="text-xs">{product.category}</Badge>
                      </div>
                    )}
                    
                    {product.shopifyProductId && (
                      <div className="pt-2 border-t">
                        <Button variant="outline" size="sm" className="w-full text-xs">
                          <ExternalLink className="w-3 h-3 mr-2" />
                          View in Shopify
                        </Button>
                      </div>
                    )}
                    
                    {product.lastSyncAt && (
                      <div className="text-xs text-gray-500">
                        Last sync: {new Date(product.lastSyncAt).toLocaleDateString()}
                      </div>
                    )}
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
