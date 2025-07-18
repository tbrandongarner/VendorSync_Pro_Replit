import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import TopBar from "@/components/layout/top-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, Users, Package, Store, Bot, Calendar, Download } from "lucide-react";
import { useState } from "react";

export default function Analytics() {
  const { isAuthenticated } = useAuth();
  const [dateRange, setDateRange] = useState("30d");

  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated,
  });

  const { data: syncJobs = [] } = useQuery({
    queryKey: ["/api/sync/jobs"],
    enabled: isAuthenticated,
  });

  const { data: aiGenerations = [] } = useQuery({
    queryKey: ["/api/ai/generations"],
    enabled: isAuthenticated,
  });

  // Calculate analytics data
  const totalProducts = products.length;
  const activeVendors = vendors.filter((v: any) => v.status === 'active').length;
  const completedSyncs = syncJobs.filter((j: any) => j.status === 'completed').length;
  const aiSuccessRate = aiGenerations.length > 0 
    ? (aiGenerations.filter((g: any) => g.success).length / aiGenerations.length) * 100 
    : 0;

  // Vendor performance data
  const vendorPerformance = vendors.map((vendor: any) => {
    const vendorProducts = products.filter((p: any) => p.vendorId === vendor.id);
    const vendorSyncs = syncJobs.filter((j: any) => j.vendorId === vendor.id);
    const completedVendorSyncs = vendorSyncs.filter((j: any) => j.status === 'completed');
    
    return {
      ...vendor,
      productCount: vendorProducts.length,
      syncCount: vendorSyncs.length,
      successRate: vendorSyncs.length > 0 
        ? (completedVendorSyncs.length / vendorSyncs.length) * 100 
        : 0,
    };
  });

  // Store performance data
  const storePerformance = stores.map((store: any) => {
    const storeProducts = products.filter((p: any) => p.storeId === store.id);
    const storeSyncs = syncJobs.filter((j: any) => j.storeId === store.id);
    
    return {
      ...store,
      productCount: storeProducts.length,
      syncCount: storeSyncs.length,
    };
  });

  const formatPercentage = (value: number) => {
    return `${Math.round(value)}%`;
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Analytics" subtitle="Insights and performance metrics for your vendor operations" />
      
      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="flex items-center space-x-4">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="outline" className="flex items-center">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Revenue Impact</p>
                  <p className="text-2xl font-semibold text-gray-900">$12,847</p>
                </div>
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
              <div className="flex items-center mt-4 text-sm">
                <span className="text-emerald-600 font-medium">+12.3%</span>
                <span className="text-gray-500 ml-1">from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Sync Success Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {syncJobs.length > 0 ? formatPercentage((completedSyncs / syncJobs.length) * 100) : '0%'}
                  </p>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="flex items-center mt-4 text-sm">
                <span className="text-blue-600 font-medium">{completedSyncs} completed</span>
                <span className="text-gray-500 ml-1">of {syncJobs.length} total</span>
              </div>
            </CardContent>
          </Card>

          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">AI Success Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">{formatPercentage(aiSuccessRate)}</p>
                </div>
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Bot className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <div className="flex items-center mt-4 text-sm">
                <span className="text-purple-600 font-medium">{aiGenerations.length} generations</span>
                <span className="text-gray-500 ml-1">this month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Vendors</p>
                  <p className="text-2xl font-semibold text-gray-900">{activeVendors}</p>
                </div>
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-orange-600" />
                </div>
              </div>
              <div className="flex items-center mt-4 text-sm">
                <span className="text-orange-600 font-medium">{vendors.length} total</span>
                <span className="text-gray-500 ml-1">vendors</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vendor Performance */}
          <Card className="polaris-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Vendor Performance
              </CardTitle>
              <CardDescription>
                Product counts and sync success rates by vendor
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vendorPerformance.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No vendor data available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {vendorPerformance.slice(0, 5).map((vendor: any) => (
                    <div key={vendor.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Users className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{vendor.name}</p>
                          <p className="text-sm text-gray-500">{vendor.productCount} products</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={vendor.successRate >= 80 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                          {formatPercentage(vendor.successRate)}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">{vendor.syncCount} syncs</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Store Performance */}
          <Card className="polaris-shadow">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Store className="w-5 h-5 mr-2" />
                Store Performance
              </CardTitle>
              <CardDescription>
                Product distribution across your stores
              </CardDescription>
            </CardHeader>
            <CardContent>
              {storePerformance.length === 0 ? (
                <div className="text-center py-8">
                  <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No store data available</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {storePerformance.map((store: any) => (
                    <div key={store.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Store className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{store.name}</p>
                          <p className="text-sm text-gray-500">{store.productCount} products</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={store.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {store.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <p className="text-xs text-gray-500 mt-1">{store.syncCount} syncs</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sync Analytics */}
          <Card className="polaris-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Sync Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Syncs</span>
                  <span className="font-semibold">{syncJobs.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Completed</span>
                  <span className="font-semibold text-green-600">{completedSyncs}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Running</span>
                  <span className="font-semibold text-blue-600">
                    {syncJobs.filter((j: any) => j.status === 'running').length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Failed</span>
                  <span className="font-semibold text-red-600">
                    {syncJobs.filter((j: any) => j.status === 'failed').length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Analytics */}
          <Card className="polaris-shadow">
            <CardHeader>
              <CardTitle className="text-lg">Product Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Products</span>
                  <span className="font-semibold">{totalProducts}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Active</span>
                  <span className="font-semibold text-green-600">
                    {products.filter((p: any) => p.isActive).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Inactive</span>
                  <span className="font-semibold text-gray-600">
                    {products.filter((p: any) => !p.isActive).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Avg per Vendor</span>
                  <span className="font-semibold">
                    {vendors.length > 0 ? Math.round(totalProducts / vendors.length) : 0}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Analytics */}
          <Card className="polaris-shadow">
            <CardHeader>
              <CardTitle className="text-lg">AI Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Generations</span>
                  <span className="font-semibold">{aiGenerations.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Successful</span>
                  <span className="font-semibold text-green-600">
                    {aiGenerations.filter((g: any) => g.success).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Failed</span>
                  <span className="font-semibold text-red-600">
                    {aiGenerations.filter((g: any) => !g.success).length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Success Rate</span>
                  <span className="font-semibold">{formatPercentage(aiSuccessRate)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
