import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Sparkles, RefreshCw } from "lucide-react";

export default function AiContentGenerator() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    productName: "",
    category: "",
    keyFeatures: "",
  });
  const [generatedContent, setGeneratedContent] = useState("");

  const generateDescriptionMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/ai/generate-description", data);
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.description);
      queryClient.invalidateQueries({ queryKey: ["/api/ai/generations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Content Generated",
        description: "AI product description generated successfully",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.productName || !formData.keyFeatures) {
      toast({
        title: "Validation Error",
        description: "Product name and key features are required",
        variant: "destructive",
      });
      return;
    }

    generateDescriptionMutation.mutate({
      productName: formData.productName,
      features: formData.keyFeatures,
    });
  };

  return (
    <Card className="polaris-shadow">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Bot className="w-5 h-5 mr-2 text-purple-600" />
          AI Content Generator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="productName">Product Name</Label>
            <Input
              id="productName"
              placeholder="Enter product name..."
              value={formData.productName}
              onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))}
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
                <SelectItem value="sports">Sports</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="keyFeatures">Key Features</Label>
            <Textarea
              id="keyFeatures"
              placeholder="Enter key features..."
              value={formData.keyFeatures}
              onChange={(e) => setFormData(prev => ({ ...prev, keyFeatures: e.target.value }))}
              rows={3}
            />
          </div>
          
          <Button 
            type="submit" 
            className="w-full bg-purple-600 hover:bg-purple-700"
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
          
          {generatedContent && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Generated Description:
              </Label>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{generatedContent}</p>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
