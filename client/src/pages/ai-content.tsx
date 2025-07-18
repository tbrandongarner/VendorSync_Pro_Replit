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
import { Bot, Sparkles, Copy, RefreshCw, History, CheckCircle } from "lucide-react";
import type { GeneratedContent } from "@/types";

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

  const { data: aiGenerations = [] } = useQuery({
    queryKey: ["/api/ai/generations"],
    enabled: isAuthenticated,
  });

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
        <Tabs defaultValue="generator" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generator">Content Generator</TabsTrigger>
            <TabsTrigger value="description">Quick Description</TabsTrigger>
            <TabsTrigger value="history">Generation History</TabsTrigger>
          </TabsList>
          
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
                {aiGenerations.length === 0 ? (
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
                    {aiGenerations.map((generation: any) => (
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
    </div>
  );
}
