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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DollarSign, TrendingUp, TrendingDown, Eye, Play, RotateCcw, Trash2, Plus, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Vendor, PricingBatch } from "@shared/schema";

interface PricingPreview {
  batchId?: number;
  changes: Array<{
    productId: number;
    productName: string;
    sku: string;
    oldPrice: string;
    newPrice: string;
    oldCompareAtPrice: string | null;
    newCompareAtPrice: string | null;
    priceChangePercent: number;
    priceChangeDollar: number;
  }>;
  summary: {
    totalProducts: number;
    averagePriceIncrease: number;
    totalValueChange: number;
    maxPriceIncrease: number;
    minPriceIncrease: number;
  };
}

export default function PricingManager() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for pricing update form
  const [selectedVendor, setSelectedVendor] = useState<string>("all");
  const [priceChangeType, setPriceChangeType] = useState<"percentage" | "fixed" | "margin_based">("percentage");
  const [priceChangeValue, setPriceChangeValue] = useState<string>("");
  const [compareAtPriceChange, setCompareAtPriceChange] = useState<string>("");
  const [includeCompareAtPrice, setIncludeCompareAtPrice] = useState(false);
  const [reason, setReason] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const [batchSize, setBatchSize] = useState<string>("3");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [createBatchDialogOpen, setCreateBatchDialogOpen] = useState(false);

  // Current preview data
  const [currentPreview, setCurrentPreview] = useState<PricingPreview | null>(null);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const { data: pricingBatches = [], refetch: refetchBatches } = useQuery<PricingBatch[]>({
    queryKey: ["/api/pricing/batches"],
    enabled: isAuthenticated,
  });

  // Preview pricing changes mutation
  const previewMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/pricing/preview", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: PricingPreview) => {
      setCurrentPreview(data);
      setPreviewDialogOpen(true);
    },
    onError: (error) => {
      console.error("Failed to generate preview:", error);
      toast({ title: "Error", description: "Failed to generate pricing preview", variant: "destructive" });
    },
  });

  // Create pricing batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/pricing/batches", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/batches"] });
      setCreateBatchDialogOpen(false);
      setPreviewDialogOpen(false);
      resetForm();
      toast({ title: "Success", description: "Pricing batch created successfully" });
    },
    onError: (error) => {
      console.error("Failed to create batch:", error);
      toast({ title: "Error", description: "Failed to create pricing batch", variant: "destructive" });
    },
  });

  // Apply batch mutation
  const applyBatchMutation = useMutation({
    mutationFn: async (batchId: number) => {
      return apiRequest(`/api/pricing/batches/${batchId}/apply`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/batches"] });
      toast({ title: "Success", description: "Pricing changes applied successfully" });
    },
    onError: (error) => {
      console.error("Failed to apply batch:", error);
      toast({ title: "Error", description: "Failed to apply pricing changes", variant: "destructive" });
    },
  });

  // Revert batch mutation
  const revertBatchMutation = useMutation({
    mutationFn: async (batchId: number) => {
      return apiRequest(`/api/pricing/batches/${batchId}/revert`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/batches"] });
      toast({ title: "Success", description: "Pricing changes reverted successfully" });
    },
    onError: (error) => {
      console.error("Failed to revert batch:", error);
      toast({ title: "Error", description: "Failed to revert pricing changes", variant: "destructive" });
    },
  });

  // Delete batch mutation
  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: number) => {
      return apiRequest(`/api/pricing/batches/${batchId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/batches"] });
      toast({ title: "Success", description: "Pricing batch deleted successfully" });
    },
    onError: (error) => {
      console.error("Failed to delete batch:", error);
      toast({ title: "Error", description: "Failed to delete pricing batch", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedVendor("all");
    setPriceChangeType("percentage");
    setPriceChangeValue("");
    setCompareAtPriceChange("");
    setIncludeCompareAtPrice(false);
    setReason("");
    setBatchName("");
    setBatchDescription("");
    setBatchSize("3");
    setCurrentPreview(null);
  };

  const handlePreview = () => {
    if (!priceChangeValue || !reason) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const data = {
      vendorId: selectedVendor === "all" ? undefined : parseInt(selectedVendor),
      priceChangeType,
      priceChangeValue: parseFloat(priceChangeValue),
      compareAtPriceChange: compareAtPriceChange ? parseFloat(compareAtPriceChange) : undefined,
      includeCompareAtPrice,
      reason,
      batchSize: parseInt(batchSize),
    };

    previewMutation.mutate(data);
  };

  const handleCreateBatch = () => {
    if (!batchName || !currentPreview) {
      toast({ title: "Error", description: "Please provide a batch name", variant: "destructive" });
      return;
    }

    const data = {
      name: batchName,
      description: batchDescription,
      vendorId: selectedVendor === "all" ? undefined : parseInt(selectedVendor),
      priceChangeType,
      priceChangeValue: parseFloat(priceChangeValue),
      compareAtPriceChange: compareAtPriceChange ? parseFloat(compareAtPriceChange) : undefined,
      includeCompareAtPrice,
      reason,
      batchSize: currentPreview.changes.length, // Use actual preview size
    };

    createBatchMutation.mutate(data);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'preview':
        return <Badge variant="secondary">Preview</Badge>;
      case 'applied':
        return <Badge variant="default">Applied</Badge>;
      case 'reverted':
        return <Badge variant="destructive">Reverted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  if (!isAuthenticated) {
    return <div>Please log in to access pricing management.</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Pricing Manager</h1>
            <p className="text-muted-foreground mt-2">
              Preview and apply bulk pricing changes with confidence
            </p>
          </div>
        </div>

        <Tabs defaultValue="create" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create Pricing Update</TabsTrigger>
            <TabsTrigger value="history">Pricing History</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pricing Update Configuration</CardTitle>
                <CardDescription>
                  Configure your pricing changes. Start with a small batch size (like 3 products) to preview the impact.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="vendor">Vendor</Label>
                      <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Vendors</SelectItem>
                          {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id.toString()}>
                              {vendor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="priceChangeType">Price Change Type</Label>
                      <Select value={priceChangeType} onValueChange={(value: any) => setPriceChangeType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed Amount</SelectItem>
                          <SelectItem value="margin_based">Margin Based</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="priceChangeValue">
                        Change Value {priceChangeType === 'percentage' ? '(%)' : '($)'}
                      </Label>
                      <Input
                        id="priceChangeValue"
                        type="number"
                        step="0.01"
                        value={priceChangeValue}
                        onChange={(e) => setPriceChangeValue(e.target.value)}
                        placeholder={priceChangeType === 'percentage' ? '10' : '5.00'}
                      />
                    </div>

                    <div>
                      <Label htmlFor="batchSize">Preview Batch Size</Label>
                      <Input
                        id="batchSize"
                        type="number"
                        min="1"
                        max="50"
                        value={batchSize}
                        onChange={(e) => setBatchSize(e.target.value)}
                        placeholder="3"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Number of products to preview (recommended: start with 3)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="includeCompareAtPrice" 
                        checked={includeCompareAtPrice}
                        onCheckedChange={setIncludeCompareAtPrice}
                      />
                      <Label htmlFor="includeCompareAtPrice">Update Compare At Price</Label>
                    </div>

                    {includeCompareAtPrice && (
                      <div>
                        <Label htmlFor="compareAtPriceChange">Compare At Price Change (%)</Label>
                        <Input
                          id="compareAtPriceChange"
                          type="number"
                          step="0.01"
                          value={compareAtPriceChange}
                          onChange={(e) => setCompareAtPriceChange(e.target.value)}
                          placeholder="15"
                        />
                      </div>
                    )}

                    <div>
                      <Label htmlFor="reason">Reason for Change</Label>
                      <Input
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., Seasonal adjustment, Cost increase"
                        required
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-end space-x-4">
                  <Button variant="outline" onClick={resetForm}>
                    Reset
                  </Button>
                  <Button 
                    onClick={handlePreview}
                    disabled={previewMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {previewMutation.isPending ? "Generating..." : "Preview Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pricing Batch History</CardTitle>
                <CardDescription>
                  View and manage your pricing update history
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pricingBatches.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No pricing batches found. Create your first pricing update to get started.
                    </div>
                  ) : (
                    pricingBatches.map((batch) => (
                      <div key={batch.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold">{batch.name}</h3>
                            <p className="text-sm text-muted-foreground">{batch.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Created: {new Date(batch.createdAt).toLocaleDateString()}
                              {batch.appliedAt && ` | Applied: ${new Date(batch.appliedAt).toLocaleDateString()}`}
                              {batch.revertedAt && ` | Reverted: ${new Date(batch.revertedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getStatusBadge(batch.status)}
                            <Badge variant="outline">{batch.totalProducts} products</Badge>
                          </div>
                        </div>
                        
                        <div className="flex justify-end space-x-2">
                          {batch.status === 'preview' && (
                            <>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700">
                                    <Play className="w-4 h-4 mr-2" />
                                    Apply
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Apply Pricing Changes?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will update prices for {batch.totalProducts} products. This action cannot be undone easily.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => applyBatchMutation.mutate(batch.id)}
                                      className="bg-green-600 hover:bg-green-700"
                                    >
                                      Apply Changes
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
                          
                          {batch.status === 'applied' && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  Revert
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revert Pricing Changes?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will restore original prices for {batch.totalProducts} products.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => revertBatchMutation.mutate(batch.id)}
                                    variant="destructive"
                                  >
                                    Revert Changes
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Pricing Batch?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. The batch history will be permanently deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteBatchMutation.mutate(batch.id)}
                                  variant="destructive"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Pricing Preview Dialog */}
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Pricing Preview</DialogTitle>
              <DialogDescription>
                Review the pricing changes before creating a batch
              </DialogDescription>
            </DialogHeader>
            
            {currentPreview && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Products</span>
                      </div>
                      <p className="text-2xl font-bold">{currentPreview.summary.totalProducts}</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Avg Change</span>
                      </div>
                      <p className="text-2xl font-bold">{currentPreview.summary.averagePriceIncrease.toFixed(1)}%</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Total Value</span>
                      </div>
                      <p className="text-2xl font-bold">{formatCurrency(currentPreview.summary.totalValueChange)}</p>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Max Change</span>
                      </div>
                      <p className="text-2xl font-bold">{currentPreview.summary.maxPriceIncrease.toFixed(1)}%</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Product Changes Table */}
                <div className="border rounded-lg">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-3 font-medium">Product</th>
                          <th className="text-left p-3 font-medium">SKU</th>
                          <th className="text-right p-3 font-medium">Old Price</th>
                          <th className="text-right p-3 font-medium">New Price</th>
                          <th className="text-right p-3 font-medium">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPreview.changes.map((change, index) => (
                          <tr key={index} className="border-t">
                            <td className="p-3">
                              <div className="font-medium truncate max-w-xs">{change.productName}</div>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">{change.sku}</td>
                            <td className="p-3 text-right">{formatCurrency(parseFloat(change.oldPrice))}</td>
                            <td className="p-3 text-right font-medium">{formatCurrency(parseFloat(change.newPrice))}</td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end">
                                <span className={`font-medium ${change.priceChangePercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {change.priceChangePercent > 0 ? '+' : ''}{change.priceChangePercent.toFixed(1)}%
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(change.priceChangeDollar)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end space-x-4">
                  <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
                    Close
                  </Button>
                  <Button onClick={() => setCreateBatchDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Batch
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Batch Dialog */}
        <Dialog open={createBatchDialogOpen} onOpenChange={setCreateBatchDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Pricing Batch</DialogTitle>
              <DialogDescription>
                Give your pricing batch a name and description
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="batchName">Batch Name</Label>
                <Input
                  id="batchName"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g., Q1 2024 Price Increase"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="batchDescription">Description</Label>
                <Textarea
                  id="batchDescription"
                  value={batchDescription}
                  onChange={(e) => setBatchDescription(e.target.value)}
                  placeholder="Optional description of the pricing changes"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button variant="outline" onClick={() => setCreateBatchDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateBatch}
                disabled={createBatchMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {createBatchMutation.isPending ? "Creating..." : "Create Batch"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}