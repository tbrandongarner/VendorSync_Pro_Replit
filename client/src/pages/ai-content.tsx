import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bot, Sparkles, Copy, RefreshCw, History, CheckCircle, Package, Edit3, Send, Eye } from "lucide-react";
import type { GeneratedContent } from "@/types";

type Product = {
  id: number;
  vendorId: number;
  storeId: number;
  name: string;
  sku: string;
  description?: string;
  price?: string;
  cost?: string;
  msrp?: string;
  quantity?: number;
  upc?: string;
  tags?: string[];
  images?: string[];
  variants?: any[];
  shopifyId?: string;
  lastSyncAt?: string;
  needsSync?: boolean;
  createdAt: string;
  updatedAt: string;
  category?: string;
  compareAtPrice?: string;
  costPrice?: string;
  inventory?: number;
};

type Vendor = {
  id: number;
  userId: string;
  name: string;
  contactEmail?: string;
  contactName?: string;
  apiUrl?: string;
  apiKey?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export default function AiContent() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    productName: "",
    category: "",
    keyFeatures: "",
    brandVoice: "",
    targetAudience: "",
  });
  
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [descriptionForm, setDescriptionForm] = useState({
    productName: "",
    features: "",
  });
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [marketingFramework, setMarketingFramework] = useState("AIDA");
  const [targetAudience, setTargetAudience] = useState("");
  const [brandVoice, setBrandVoice] = useState("professional");
  const [generatedMarketing, setGeneratedMarketing] = useState<any>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  
  // Product search and details state
  const [productSearch, setProductSearch] = useState('');
  const [productDetails, setProductDetails] = useState({
    customName: '',
    primaryKeyword: '',
    secondaryKeyword: '',
    features: '',
    specs: ''
  });

  const { data: aiGenerations = [] } = useQuery({
    queryKey: ["/api/ai/generations"],
    enabled: isAuthenticated,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const marketingFrameworks = [
    { value: "AIDA", label: "AIDA", description: "Attention → Interest → Desire → Action" },
    { value: "PAS", label: "PAS", description: "Problem → Agitation → Solution" },
    { value: "Features-Benefits-Advantages", label: "FBA", description: "Features → Benefits → Advantages" },
    { value: "Before-After-Bridge", label: "BAB", description: "Before → After → Bridge" },
    { value: "STAR", label: "STAR", description: "Situation → Task → Action → Result" }
  ];

  const getVendorName = (vendorId: number): string => {
    const vendor = (vendors as Vendor[]).find((v: Vendor) => v.id === vendorId);
    return vendor?.name || 'Unknown Vendor';
  };

  const generateContentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ai/generate-content", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/generations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Content Generated",
        description: "AI-powered content has been generated successfully",
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
        description: "Failed to generate content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateDescriptionMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ai/generate-description", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedDescription(data.description);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/generations"] });
      toast({
        title: "Description Generated",
        description: "Product description has been generated successfully",
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
        description: "Failed to generate description. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateMarketingMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ai/generate-marketing", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedMarketing(data);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/generations"] });
      toast({
        title: "Marketing Content Generated",
        description: `${data.framework} framework applied successfully`,
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
        description: "Failed to generate marketing content. Please try again.",
        variant: "destructive",
      });
    },
  });

  const publishToProductMutation = useMutation({
    mutationFn: async (data: { productId: number; description: string }) => {
      const response = await apiRequest("PATCH", `/api/products/${data.productId}`, {
        description: data.description,
        needsSync: true,
        lastModifiedBy: 'ai_content_generator'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Published Successfully",
        description: "Product description updated and marked for sync",
      });
      setShowPublishDialog(false);
      setGeneratedMarketing(null);
      setSelectedProduct(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to publish description. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateContent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.productName) {
      toast({
        title: "Validation Error",
        description: "Product name is required",
        variant: "destructive",
      });
      return;
    }
    generateContentMutation.mutate(formData);
  };

  const handleGenerateDescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descriptionForm.productName || !descriptionForm.features) {
      toast({
        title: "Validation Error",
        description: "Product name and features are required",
        variant: "destructive",
      });
      return;
    }
    generateDescriptionMutation.mutate(descriptionForm);
  };

  // Filter products based on search
  const filteredProducts = (products as Product[]).filter((product: Product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
    getVendorName(product.vendorId).toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleGenerateMarketing = () => {
    if (!selectedProduct) {
      toast({
        title: "No Product Selected",
        description: "Please select a product first",
        variant: "destructive",
      });
      return;
    }

    const vendor = (vendors as Vendor[]).find((v: Vendor) => v.id === selectedProduct.vendorId);
    
    // Use custom details if provided, otherwise fall back to product data
    const productName = productDetails.customName || selectedProduct.name;
    const features = productDetails.features || extractFeatures(selectedProduct);
    
    const marketingData = {
      productName,
      currentDescription: selectedProduct.description,
      features,
      primaryKeyword: productDetails.primaryKeyword,
      secondaryKeyword: productDetails.secondaryKeyword,
      specs: productDetails.specs,
      targetAudience,
      framework: marketingFramework,
      brandVoice,
      price: selectedProduct.price,
      category: selectedProduct.category,
      upc: selectedProduct.upc,
      variants: selectedProduct.variants,
      vendorName: vendor?.name
    };

    generateMarketingMutation.mutate(marketingData);
  };

  const extractFeatures = (product: Product): string => {
    const features = [];
    if (product.sku) features.push(`SKU: ${product.sku}`);
    if (product.upc) features.push(`UPC: ${product.upc}`);
    if (product.price) features.push(`Price: $${product.price}`);
    if (product.compareAtPrice) features.push(`MSRP: $${product.compareAtPrice}`);
    if (product.costPrice) features.push(`Cost: $${product.costPrice}`);
    if (product.inventory) features.push(`Stock: ${product.inventory} units`);
    if (product.variants && Array.isArray(product.variants) && product.variants.length > 1) {
      features.push(`${product.variants.length} variants available`);
    }
    if (product.tags && Array.isArray(product.tags)) {
      features.push(`Tags: ${product.tags.join(', ')}`);
    }
    return features.join('; ');
  };

  const handlePublishDescription = () => {
    if (!selectedProduct || !generatedMarketing?.description) return;
    
    publishToProductMutation.mutate({
      productId: selectedProduct.id,
      description: generatedMarketing.description
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="AI Content" subtitle="Generate compelling product content with artificial intelligence" />
      
      <div className="p-6 space-y-6">
        <Tabs defaultValue="marketing" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="marketing">Marketing Content</TabsTrigger>
            <TabsTrigger value="generator">Content Generator</TabsTrigger>
            <TabsTrigger value="description">Quick Description</TabsTrigger>
            <TabsTrigger value="history">Generation History</TabsTrigger>
          </TabsList>
          
          <TabsContent value="marketing" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Product Selection & Marketing Setup */}
              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="w-5 h-5 mr-2 text-blue-600" />
                    Marketing Content Generator
                  </CardTitle>
                  <CardDescription>
                    Select a product and generate compelling marketing descriptions using proven frameworks
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Product Search */}
                  <div className="space-y-2">
                    <Label>Search Products</Label>
                    <Input
                      placeholder="Search by product name, SKU, or vendor..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  {/* Product Selection */}
                  <div className="space-y-3">
                    <Label>Select Product</Label>
                    <div className="max-h-48 overflow-y-auto border rounded-lg">
                      {filteredProducts.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p>
                            {productSearch 
                              ? `No products found matching "${productSearch}"`
                              : "No products found. Sync some products first."
                            }
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 p-2">
                          {filteredProducts.map((product: Product) => (
                            <div
                              key={product.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedProduct?.id === product.id
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                              onClick={() => setSelectedProduct(product)}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-medium text-sm">{product.name}</h4>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {getVendorName(product.vendorId)} • SKU: {product.sku}
                                  </p>
                                  {product.price && (
                                    <p className="text-xs font-medium text-green-600 mt-1">
                                      ${product.price}
                                    </p>
                                  )}
                                </div>
                                {selectedProduct?.id === product.id && (
                                  <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Product Details Customization */}
                  {selectedProduct && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
                      <Label className="text-sm font-medium text-gray-700">
                        Customize Product Details (Optional)
                      </Label>
                      
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Product Name</Label>
                          <Input
                            placeholder={selectedProduct.name}
                            value={productDetails.customName}
                            onChange={(e) => setProductDetails(prev => ({ ...prev, customName: e.target.value }))}
                            className="text-sm"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Primary Keyword</Label>
                            <Input
                              placeholder="Main keyword..."
                              value={productDetails.primaryKeyword}
                              onChange={(e) => setProductDetails(prev => ({ ...prev, primaryKeyword: e.target.value }))}
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Secondary Keyword</Label>
                            <Input
                              placeholder="Secondary keyword..."
                              value={productDetails.secondaryKeyword}
                              onChange={(e) => setProductDetails(prev => ({ ...prev, secondaryKeyword: e.target.value }))}
                              className="text-sm"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <Label className="text-xs">Key Features</Label>
                          <Textarea
                            placeholder="List key features, benefits, and highlights..."
                            value={productDetails.features}
                            onChange={(e) => setProductDetails(prev => ({ ...prev, features: e.target.value }))}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <Label className="text-xs">Specifications</Label>
                          <Textarea
                            placeholder="Technical specs, dimensions, materials..."
                            value={productDetails.specs}
                            onChange={(e) => setProductDetails(prev => ({ ...prev, specs: e.target.value }))}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Marketing Framework Selection */}
                  <div className="space-y-2">
                    <Label>Marketing Framework</Label>
                    <Select value={marketingFramework} onValueChange={setMarketingFramework}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {marketingFrameworks.map((framework) => (
                          <SelectItem key={framework.value} value={framework.value}>
                            <div className="text-left">
                              <div className="font-medium">{framework.label}</div>
                              <div className="text-xs text-gray-500">{framework.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Target Audience */}
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Input
                      placeholder="e.g., Tech professionals, outdoor enthusiasts, budget-conscious families"
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                    />
                  </div>

                  {/* Brand Voice */}
                  <div className="space-y-2">
                    <Label>Brand Voice</Label>
                    <Select value={brandVoice} onValueChange={setBrandVoice}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional & Trustworthy</SelectItem>
                        <SelectItem value="friendly">Friendly & Approachable</SelectItem>
                        <SelectItem value="luxury">Luxury & Premium</SelectItem>
                        <SelectItem value="energetic">Energetic & Exciting</SelectItem>
                        <SelectItem value="technical">Technical & Detailed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Generate Button */}
                  <Button 
                    onClick={handleGenerateMarketing}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={generateMarketingMutation.isPending || !selectedProduct}
                  >
                    {generateMarketingMutation.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Generating Marketing Content...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Marketing Description
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Generated Marketing Content */}
              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Generated Marketing Content</span>
                    {generatedMarketing && selectedProduct && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPublishDialog(true)}
                        className="text-green-600 border-green-600 hover:bg-green-50"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Publish to Product
                      </Button>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {generatedMarketing ? 
                      `${generatedMarketing.framework} framework applied` : 
                      'Marketing-focused content will appear here'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedMarketing ? (
                    <div className="space-y-6">
                      {/* Framework Badge */}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {generatedMarketing.framework} Framework
                        </Badge>
                        {selectedProduct && (
                          <Badge variant="outline" className="text-xs">
                            {selectedProduct.name}
                          </Badge>
                        )}
                      </div>

                      {/* Main Description */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Marketing Description</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(generatedMarketing.description)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">
                            {generatedMarketing.description}
                          </p>
                        </div>
                      </div>

                      {/* Key Benefits */}
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">Key Benefits</Label>
                        <div className="space-y-2">
                          {generatedMarketing.bullets?.map((bullet: string, index: number) => (
                            <div key={index} className="flex items-start bg-gray-50 p-3 rounded-lg">
                              <CheckCircle className="w-4 h-4 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{bullet}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Call to Action */}
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">Call to Action</Label>
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <p className="text-sm font-medium text-orange-800">
                            {generatedMarketing.cta}
                          </p>
                        </div>
                      </div>

                      {/* SEO Keywords */}
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">SEO Keywords</Label>
                        <div className="flex flex-wrap gap-1">
                          {generatedMarketing.seoKeywords?.map((keyword: string, index: number) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 mb-2">Select a product and generate marketing content</p>
                      <p className="text-xs text-gray-400">
                        Choose from AIDA, PAS, FBA, BAB, or STAR frameworks
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="generator" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input Form */}
              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Bot className="w-5 h-5 mr-2 text-purple-600" />
                    AI Content Generator
                  </CardTitle>
                  <CardDescription>
                    Generate comprehensive product content including titles, descriptions, and SEO elements
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleGenerateContent} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="productName">Product Name *</Label>
                      <Input
                        id="productName"
                        placeholder="Enter product name..."
                        value={formData.productName}
                        onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="electronics">Electronics</SelectItem>
                          <SelectItem value="fashion">Fashion</SelectItem>
                          <SelectItem value="home-garden">Home & Garden</SelectItem>
                          <SelectItem value="sports">Sports & Outdoors</SelectItem>
                          <SelectItem value="beauty">Beauty & Personal Care</SelectItem>
                          <SelectItem value="books">Books & Media</SelectItem>
                          <SelectItem value="toys">Toys & Games</SelectItem>
                          <SelectItem value="automotive">Automotive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="keyFeatures">Key Features</Label>
                      <Textarea
                        id="keyFeatures"
                        placeholder="List the key features and benefits..."
                        value={formData.keyFeatures}
                        onChange={(e) => setFormData(prev => ({ ...prev, keyFeatures: e.target.value }))}
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="brandVoice">Brand Voice</Label>
                      <Select value={formData.brandVoice} onValueChange={(value) => setFormData(prev => ({ ...prev, brandVoice: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select brand voice" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual & Friendly</SelectItem>
                          <SelectItem value="luxury">Luxury & Premium</SelectItem>
                          <SelectItem value="playful">Playful & Fun</SelectItem>
                          <SelectItem value="technical">Technical & Detailed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="targetAudience">Target Audience</Label>
                      <Input
                        id="targetAudience"
                        placeholder="e.g., Young professionals, Parents, Tech enthusiasts"
                        value={formData.targetAudience}
                        onChange={(e) => setFormData(prev => ({ ...prev, targetAudience: e.target.value }))}
                      />
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      disabled={generateContentMutation.isPending}
                    >
                      {generateContentMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Content
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Generated Content */}
              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle>Generated Content</CardTitle>
                  <CardDescription>
                    AI-generated content will appear here
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedContent ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Optimized Title</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(generatedContent.title)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm">{generatedContent.title}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Product Description</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(generatedContent.description)}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{generatedContent.description}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Key Selling Points</Label>
                        <div className="space-y-1">
                          {generatedContent.bullets.map((bullet, index) => (
                            <div key={index} className="flex items-start">
                              <CheckCircle className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{bullet}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>SEO Tags</Label>
                        <div className="flex flex-wrap gap-1">
                          {generatedContent.tags.map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>SEO Title</Label>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm">{generatedContent.seoTitle}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Meta Description</Label>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm">{generatedContent.metaDescription}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Generated content will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="description" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle>Quick Description Generator</CardTitle>
                  <CardDescription>
                    Generate product descriptions quickly with minimal input
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleGenerateDescription} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="descProductName">Product Name *</Label>
                      <Input
                        id="descProductName"
                        placeholder="Enter product name..."
                        value={descriptionForm.productName}
                        onChange={(e) => setDescriptionForm(prev => ({ ...prev, productName: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="features">Key Features *</Label>
                      <Textarea
                        id="features"
                        placeholder="List the main features and benefits..."
                        value={descriptionForm.features}
                        onChange={(e) => setDescriptionForm(prev => ({ ...prev, features: e.target.value }))}
                        rows={4}
                        required
                      />
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      disabled={generateDescriptionMutation.isPending}
                    >
                      {generateDescriptionMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Description
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="polaris-shadow">
                <CardHeader>
                  <CardTitle>Generated Description</CardTitle>
                  <CardDescription>
                    Quick product description
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedDescription ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Product Description</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(generatedDescription)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap">{generatedDescription}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Generated description will appear here</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="history" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <History className="w-5 h-5 mr-2" />
                  Generation History
                </CardTitle>
                <CardDescription>
                  Your recent AI content generations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(aiGenerations as any[]).length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No generations yet
                    </h3>
                    <p className="text-gray-600">
                      Generate your first content to see history here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(aiGenerations as any[]).map((generation: any) => (
                      <div key={generation.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Badge className={generation.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {generation.success ? 'Success' : 'Failed'}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {generation.model}
                            </span>
                          </div>
                          <span className="text-sm text-gray-500">
                            {new Date(generation.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs font-medium text-gray-600">Prompt</Label>
                            <p className="text-sm text-gray-900">{generation.prompt}</p>
                          </div>
                          
                          {generation.success && (
                            <div>
                              <Label className="text-xs font-medium text-gray-600">Generated Content</Label>
                              <div className="p-3 bg-gray-50 rounded-lg mt-1">
                                <p className="text-sm whitespace-pre-wrap line-clamp-3">
                                  {typeof generation.generatedContent === 'string' 
                                    ? generation.generatedContent 
                                    : JSON.stringify(generation.generatedContent, null, 2)
                                  }
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {generation.tokensUsed && (
                            <div className="text-xs text-gray-500">
                              Tokens used: {generation.tokensUsed}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Publish to Product Dialog */}
      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Send className="w-5 h-5 mr-2 text-green-600" />
              Publish Description to Product
            </DialogTitle>
            <DialogDescription>
              This will update the product description in your database and mark it for Shopify sync.
            </DialogDescription>
          </DialogHeader>
          
          {selectedProduct && generatedMarketing && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-sm mb-2">Product: {selectedProduct.name}</h4>
                <p className="text-xs text-gray-600 mb-3">
                  Vendor: {getVendorName(selectedProduct.vendorId)} • SKU: {selectedProduct.sku}
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Current Description:</Label>
                  <p className="text-xs text-gray-700 bg-white p-2 rounded border max-h-20 overflow-y-auto">
                    {selectedProduct.description || 'No description set'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">New Marketing Description:</Label>
                <div className="p-3 bg-blue-50 rounded border border-blue-200 max-h-32 overflow-y-auto">
                  <p className="text-xs whitespace-pre-wrap">
                    {generatedMarketing.description}
                  </p>
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start">
                  <Eye className="w-4 h-4 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800">
                    <p className="font-medium mb-1">What happens next:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Product description will be updated in the database</li>
                      <li>• Product will be marked as "needs sync" to Shopify</li>
                      <li>• Use the sync feature to push changes to your store</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handlePublishDescription}
              disabled={publishToProductMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {publishToProductMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Publish Description
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
