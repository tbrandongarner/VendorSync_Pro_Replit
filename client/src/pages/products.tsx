import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductEditDialog } from "@/components/ui/product-edit-dialog";
import { Search, Box, Filter, ExternalLink, Grid3X3, List, LayoutGrid, Trash, Edit, RefreshCw, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Product, Vendor, Store, UpdateProduct } from "@shared/schema";

export default function Products() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"cards" | "list" | "grid">("cards");
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated,
  });

  // Product update mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateProduct }) => {
      return apiRequest(`/api/products/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Success", description: "Product updated successfully" });
    },
    onError: (error) => {
      console.error("Failed to update product:", error);
      toast({ title: "Error", description: "Failed to update product", variant: "destructive" });
    },
  });

  // Add sync status filter state
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>("all");

  const filteredProducts = products.filter((product: Product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.brand?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesVendor = selectedVendor === "all" || product.vendorId.toString() === selectedVendor;
    const matchesStore = selectedStore === "all" || product.storeId.toString() === selectedStore;
    const matchesBrand = selectedBrand === "all" || product.brand === selectedBrand;
    const matchesStatus = selectedStatus === "all" || product.status === selectedStatus;
    const matchesSync = syncStatusFilter === "all" || 
                       (syncStatusFilter === "needs_sync" && product.needsSync) ||
                       (syncStatusFilter === "synced" && !product.needsSync);
    
    return matchesSearch && matchesVendor && matchesStore && matchesBrand && matchesStatus && matchesSync;
  });

  // Get unique brands for filter dropdown
  const uniqueBrands = Array.from(new Set(products.map((p: Product) => p.brand).filter(Boolean)));
  
  // Get unique statuses for filter dropdown
  const uniqueStatuses = Array.from(new Set(products.map((p: Product) => p.status).filter(Boolean)));

  const getVendorName = (vendorId: number) => {
    const vendor = vendors.find((v: Vendor) => v.id === vendorId);
    return vendor?.name || 'Unknown Vendor';
  };

  const getStoreName = (storeId: number) => {
    const store = stores.find((s: Store) => s.id === storeId);
    return store?.name || 'Unknown Store';
  };

  const handleEditProduct = (product: Product) => {
    setEditProduct(product);
  };

  const handleSaveProduct = async (data: UpdateProduct) => {
    if (editProduct) {
      await updateProductMutation.mutateAsync({ id: editProduct.id, data });
      setEditProduct(null);
    }
  };

  const syncProductsNeedingSync = async () => {
    const productsToSync = products.filter(p => p.needsSync);
    if (productsToSync.length === 0) {
      toast({ title: "Info", description: "No products need syncing" });
      return;
    }
    // TODO: Implement batch sync for products that need sync
    toast({ title: "Info", description: `${productsToSync.length} products marked for sync` });
  };

  const formatPrice = (price: string | number) => {
    if (!price) return 'N/A';
    return `$${parseFloat(price.toString()).toFixed(2)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Products" subtitle="Manage your synchronized products across all vendors" />
      
      <div className="p-6 space-y-6">
        {/* Filters and View Controls */}
        <Card className="polaris-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <Filter className="w-5 h-5 mr-2" />
                Filters
              </CardTitle>
              <div className="flex items-center space-x-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (confirm('Are you sure you want to delete ALL products? This action cannot be undone.')) {
                      try {
                        const response = await fetch('/api/products', { method: 'DELETE' });
                        if (response.ok) {
                          refetchProducts();
                          toast({ title: 'Success', description: 'All products deleted successfully' });
                        }
                      } catch (error) {
                        toast({ title: 'Error', description: 'Failed to delete products', variant: 'destructive' });
                      }
                    }
                  }}
                >
                  <Trash className="w-4 h-4 mr-2" />
                  Delete All
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncProductsNeedingSync}
                  disabled={products.filter(p => p.needsSync).length === 0}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Changes ({products.filter(p => p.needsSync).length})
                </Button>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">View:</span>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <Button
                      variant={viewMode === "cards" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("cards")}
                      className="rounded-none border-0"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className="rounded-none border-0 border-l"
                    >
                      <List className="w-4 h-4" />
                    </Button>
                    <Button
                      variant={viewMode === "grid" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className="rounded-none border-0 border-l"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search products, SKU, or brand..."
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
                    {vendors.map((vendor: Vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id.toString()}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Brands" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {uniqueBrands.map((brand: string) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={syncStatusFilter} onValueChange={setSyncStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sync Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="needs_sync">
                      <div className="flex items-center">
                        <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
                        Needs Sync
                      </div>
                    </SelectItem>
                    <SelectItem value="synced">
                      <div className="flex items-center">
                        <RefreshCw className="w-4 h-4 mr-2 text-green-500" />
                        Synced
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedVendor("all");
                    setSelectedStore("all");
                    setSelectedBrand("all");
                    setSelectedStatus("all");
                    setSyncStatusFilter("all");
                  }}
                >
                  Clear All
                </Button>
              </div>
              
              <div className="text-sm text-gray-600">
                Showing {filteredProducts.length} of {products.length} products
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Display */}
        {productsLoading ? (
          <div className={`grid gap-6 ${
            viewMode === 'cards' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
            viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-3 lg:grid-cols-4' :
            'grid-cols-1'
          }`}>
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
                {searchTerm || (selectedVendor !== "all") || (selectedStore !== "all") || (selectedBrand !== "all") || (selectedStatus !== "all") ? 'No products found' : 'No products synced yet'}
              </h3>
              <p className="text-gray-600">
                {searchTerm || (selectedVendor !== "all") || (selectedStore !== "all") || (selectedBrand !== "all") || (selectedStatus !== "all")
                  ? 'Try adjusting your filters or search terms'
                  : 'Products will appear here once vendors start syncing their catalogs'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className={`${
            viewMode === 'list' ? 'space-y-4' : 
            `grid gap-6 ${
              viewMode === 'cards' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
              'grid-cols-1 md:grid-cols-3 lg:grid-cols-4'
            }`
          }`}>
            {filteredProducts.map((product: Product) => {
              if (viewMode === 'list') {
                return (
                  <Card key={product.id} className="polaris-shadow hover:polaris-shadow-hover transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg truncate">{product.name}</h3>
                            <p className="text-sm text-gray-600 truncate">
                              {getVendorName(product.vendorId)} • SKU: {product.sku}
                              {product.upc && <span> • UPC: {product.upc}</span>}
                            </p>
                            {product.costPrice && (
                              <p className="text-xs text-gray-500">
                                Cost: ${parseFloat(product.costPrice).toFixed(2)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center space-x-3 text-sm">
                            {product.brand && (
                              <Badge variant="outline">{product.brand}</Badge>
                            )}
                            <Badge className={getStatusColor(product.status || 'active')}>
                              {product.status || 'Active'}
                            </Badge>
                            <span className="font-semibold text-lg">
                              {formatPrice(product.price)}
                            </span>
                            <span className="text-gray-500">
                              Stock: {product.inventory || 0}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleEditProduct(product)}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </Button>
                          {product.needsSync && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Needs Sync
                            </Badge>
                          )}
                          {product.shopifyProductId && (
                            <Button variant="outline" size="sm">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={product.id} className={`polaris-shadow hover:polaris-shadow-hover transition-all ${
                  viewMode === 'grid' ? 'h-64' : ''
                }`}>
                  <CardHeader className={viewMode === 'grid' ? 'pb-2' : ''}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className={`truncate ${viewMode === 'grid' ? 'text-base' : 'text-lg'}`}>
                            {product.name}
                          </CardTitle>
                          {product.needsSync && (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs">
                              <AlertTriangle className="w-3 h-3" />
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="truncate">
                          {getVendorName(product.vendorId)} {viewMode !== 'grid' && `• ${getStoreName(product.storeId)}`}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleEditProduct(product)}
                          className="text-xs"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Badge className={getStatusColor(product.status || 'active')}>
                          {product.status || 'Active'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className={viewMode === 'grid' ? 'pt-0' : ''}>
                    <div className={`space-y-${viewMode === 'grid' ? '2' : '3'}`}>
                      {product.sku && (
                        <div className={`flex items-center justify-between ${viewMode === 'grid' ? 'text-xs' : 'text-sm'}`}>
                          <span className="text-gray-600">SKU</span>
                          <span className="font-mono">{product.sku}</span>
                        </div>
                      )}
                      
                      {viewMode !== 'grid' && product.upc && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">UPC</span>
                          <span className="font-mono text-xs">{product.upc}</span>
                        </div>
                      )}
                      
                      <div className={`flex items-center justify-between ${viewMode === 'grid' ? 'text-xs' : 'text-sm'}`}>
                        <span className="text-gray-600">Price</span>
                        <span className="font-medium">{formatPrice(product.price)}</span>
                      </div>
                      
                      {viewMode !== 'grid' && product.costPrice && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Cost</span>
                          <span className="font-medium text-green-600">${parseFloat(product.costPrice).toFixed(2)}</span>
                        </div>
                      )}
                      
                      {viewMode !== 'grid' && product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price || 0) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Compare at</span>
                          <span className="text-gray-500 line-through">{formatPrice(product.compareAtPrice)}</span>
                        </div>
                      )}
                      
                      <div className={`flex items-center justify-between ${viewMode === 'grid' ? 'text-xs' : 'text-sm'}`}>
                        <span className="text-gray-600">Stock</span>
                        <span className="font-medium">{product.inventory || 0}</span>
                      </div>
                      
                      {viewMode !== 'grid' && product.brand && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Brand</span>
                          <Badge variant="outline" className="text-xs">{product.brand}</Badge>
                        </div>
                      )}
                      
                      {viewMode !== 'grid' && product.category && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Category</span>
                          <Badge variant="outline" className="text-xs">{product.category}</Badge>
                        </div>
                      )}
                      
                      {viewMode !== 'grid' && product.variants && Array.isArray(product.variants) && product.variants.length > 1 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Variants</span>
                          <Badge variant="outline" className="text-xs">{product.variants.length} options</Badge>
                        </div>
                      )}
                      
                      {viewMode !== 'grid' && product.shopifyProductId && (
                        <div className="pt-2 border-t">
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            <ExternalLink className="w-3 h-3 mr-2" />
                            View in Shopify
                          </Button>
                        </div>
                      )}
                      
                      {viewMode !== 'grid' && product.lastSyncAt && (
                        <div className="text-xs text-gray-500">
                          Last sync: {new Date(product.lastSyncAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Edit Product Dialog */}
        {editProduct && (
          <ProductEditDialog
            product={editProduct}
            open={!!editProduct}
            onOpenChange={(open) => !open && setEditProduct(null)}
            onSave={handleSaveProduct}
          />
        )}
      </div>
    </div>
  );
}
