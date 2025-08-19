import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Upload, X, Star, Download } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  images: string[] | null;
  primaryImage?: string | null;
  shopifyProductId?: string | null;
}

interface ProductImageGalleryProps {
  product: Product;
  onUpdate: () => void;
}

export function ProductImageGallery({ product, onUpdate }: ProductImageGalleryProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('images', file);
      });
      
      const response = await fetch(`/api/products/${product.id}/images/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Images uploaded successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const response = await fetch(`/api/products/${product.id}/images/primary`, {
        method: 'PUT',
        body: JSON.stringify({ imageUrl }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to set primary image');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Primary image updated',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      const response = await fetch(`/api/products/${product.id}/images`, {
        method: 'DELETE',
        body: JSON.stringify({ imageUrl }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete image');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Image deleted successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const syncShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/products/${product.id}/images/sync-shopify`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to sync images');
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Success',
        description: `Synced ${data.syncedCount} images from Shopify`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      onUpdate();
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const invalidFiles = Array.from(files).filter(file => !validTypes.includes(file.type));
    
    if (invalidFiles.length > 0) {
      toast({
        title: 'Invalid File Type',
        description: 'Please select only image files (JPEG, PNG, WebP, GIF)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file sizes (10MB limit)
    const oversizedFiles = Array.from(files).filter(file => file.size > 10 * 1024 * 1024);
    
    if (oversizedFiles.length > 0) {
      toast({
        title: 'File Too Large',
        description: 'Please select files smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    uploadMutation.mutate(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const images = product.images || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Product Images</h3>
        <div className="flex gap-2">
          {product.shopifyProductId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncShopifyMutation.mutate()}
              disabled={syncShopifyMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {syncShopifyMutation.isPending ? 'Syncing...' : 'Sync from Shopify'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Images'}
          </Button>
        </div>
      </div>

      <Input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-primary hover:bg-primary/5'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-600">
          Drag and drop images here, or click to select files
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Supports JPEG, PNG, WebP, GIF (max 10MB each)
        </p>
      </div>

      {/* Image Gallery */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((imageUrl, index) => (
            <Card key={index} className="relative group">
              <CardContent className="p-2">
                <div className="relative aspect-square">
                  <img
                    src={imageUrl}
                    alt={`${product.name} - Image ${index + 1}`}
                    className="w-full h-full object-cover rounded"
                    loading="lazy"
                  />
                  
                  {/* Primary Badge */}
                  {product.primaryImage === imageUrl && (
                    <Badge className="absolute top-2 left-2 bg-yellow-500 hover:bg-yellow-600">
                      <Star className="h-3 w-3 mr-1" />
                      Primary
                    </Badge>
                  )}

                  {/* Action Buttons */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    {product.primaryImage !== imageUrl && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 w-8 p-0"
                        onClick={() => setPrimaryMutation.mutate(imageUrl)}
                        disabled={setPrimaryMutation.isPending}
                        title="Set as Primary"
                      >
                        <Star className="h-3 w-3" />
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 w-8 p-0"
                      onClick={() => deleteMutation.mutate(imageUrl)}
                      disabled={deleteMutation.isPending}
                      title="Delete Image"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Upload className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>No images uploaded yet</p>
          <p className="text-sm text-gray-400">Upload or sync images to get started</p>
        </div>
      )}
    </div>
  );
}