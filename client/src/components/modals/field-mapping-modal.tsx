import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw, Settings, ArrowRight, Copy } from "lucide-react";

interface FieldMappingModalProps {
  vendor: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FieldMapping {
  sku_column: string;
  name_column: string;
  description_column: string;
  price_column: string;
  cost_column: string;
  msrp_column: string;
  compare_price_column: string;
  inventory_column: string;
  category_column: string;
  barcode_column: string;
  images_column: string;
  tags_column: string;
}

const PRODUCT_FIELDS = [
  { key: 'sku_column', label: 'SKU / Product Code', required: true, description: 'Unique identifier for each product' },
  { key: 'name_column', label: 'Product Name', required: true, description: 'Title or name of the product' },
  { key: 'description_column', label: 'Description', required: false, description: 'Product description or details' },
  { key: 'price_column', label: 'Price', required: true, description: 'Selling price of the product' },
  { key: 'cost_column', label: 'Cost', required: false, description: 'Your cost for the product' },
  { key: 'msrp_column', label: 'MSRP', required: false, description: 'Manufacturer suggested retail price' },
  { key: 'compare_price_column', label: 'Compare At Price', required: false, description: 'Original price to show discounts' },
  { key: 'inventory_column', label: 'Inventory', required: false, description: 'Stock quantity available' },
  { key: 'category_column', label: 'Category', required: false, description: 'Product category or type' },
  { key: 'barcode_column', label: 'Barcode', required: false, description: 'UPC, EAN, or other barcode' },
  { key: 'images_column', label: 'Images', required: false, description: 'Image URLs (comma-separated)' },
  { key: 'tags_column', label: 'Tags', required: false, description: 'Product tags (comma-separated)' },
];

const COMMON_COLUMN_NAMES = [
  // SKU variations
  'SKU', 'Product Code', 'Item Code', 'Model', 'Variant SKU', 'Product SKU',
  // Name variations  
  'Product Name', 'Title', 'Item Name', 'Product Title', 'Name',
  // Price variations
  'Price', 'Selling Price', 'Retail Price', 'Unit Price', 'Variant Price',
  // Cost variations
  'Cost', 'Cost Price', 'Wholesale Price', 'Buy Price', 'Purchase Price',
  // MSRP variations
  'MSRP', 'RRP', 'List Price', 'Suggested Price', 'Manufacturer Price',
  // Description variations
  'Description', 'Product Description', 'Details', 'Body', 'Body (HTML)',
  // Inventory variations
  'Inventory', 'Stock', 'Quantity', 'QTY', 'Available', 'Inventory Quantity',
  // Category variations
  'Category', 'Product Type', 'Department', 'Collection', 'Product Category',
  // Images variations
  'Image', 'Images', 'Photo', 'Image URL', 'Image Src', 'Picture',
  // Tags variations
  'Tags', 'Keywords', 'Labels', 'Product Tags'
];

export default function FieldMappingModal({ vendor, isOpen, onClose, onSuccess }: FieldMappingModalProps) {
  const { toast } = useToast();
  const [mapping, setMapping] = useState<FieldMapping>({
    sku_column: 'Variant SKU',
    name_column: 'Title',
    description_column: 'Body (HTML)',
    price_column: 'Variant Price', 
    cost_column: 'Cost',
    msrp_column: 'MSRP',
    compare_price_column: 'Variant Compare At Price',
    inventory_column: 'Inventory',
    category_column: 'Category',
    barcode_column: 'Variant Barcode',
    images_column: 'Image Src',
    tags_column: 'Tags'
  });

  // Load existing mapping from vendor if available
  useEffect(() => {
    if (vendor?.dataSourceConfig) {
      try {
        const existingConfig = JSON.parse(vendor.dataSourceConfig);
        setMapping(prev => ({ ...prev, ...existingConfig }));
      } catch (error) {
        console.warn('Failed to parse existing mapping:', error);
      }
    }
  }, [vendor]);

  const saveMappingMutation = useMutation({
    mutationFn: async (mappingData: FieldMapping) => {
      const response = await apiRequest("PATCH", `/api/vendors/${vendor.id}`, {
        dataSourceConfig: JSON.stringify(mappingData)
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: "Field Mapping Saved",
        description: "Your field mapping configuration has been saved successfully",
      });
      onSuccess?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save field mapping",
        variant: "destructive",
      });
    },
  });

  const handleMappingChange = (field: keyof FieldMapping, value: string) => {
    setMapping(prev => ({
      ...prev,
      [field]: value === "__skip__" ? "" : value
    }));
  };

  const handleSave = () => {
    // Validate required fields
    const requiredFields = PRODUCT_FIELDS.filter(f => f.required);
    const missingFields = requiredFields.filter(f => !mapping[f.key as keyof FieldMapping]);
    
    if (missingFields.length > 0) {
      toast({
        title: "Missing Required Fields",
        description: `Please map: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    saveMappingMutation.mutate(mapping);
  };

  const loadPreset = (presetName: string) => {
    let preset: Partial<FieldMapping> = {};
    
    switch (presetName) {
      case 'shopify':
        preset = {
          sku_column: 'Variant SKU',
          name_column: 'Title',
          description_column: 'Body (HTML)',
          price_column: 'Variant Price',
          compare_price_column: 'Variant Compare At Price',
          inventory_column: 'Variant Inventory Qty',
          category_column: 'Product Category',
          barcode_column: 'Variant Barcode',
          images_column: 'Image Src',
          tags_column: 'Tags'
        };
        break;
      case 'basic':
        preset = {
          sku_column: 'SKU',
          name_column: 'Product Name',
          description_column: 'Description',
          price_column: 'Price',
          cost_column: 'Cost',
          inventory_column: 'Inventory',
          category_column: 'Category',
          images_column: 'Images'
        };
        break;
      case 'wholesale':
        preset = {
          sku_column: 'Item Code',
          name_column: 'Product Name',
          description_column: 'Description',
          price_column: 'Retail Price',
          cost_column: 'Wholesale Price',
          msrp_column: 'MSRP',
          inventory_column: 'Stock',
          category_column: 'Category'
        };
        break;
    }
    
    setMapping(prev => ({ ...prev, ...preset }));
    toast({
      title: "Preset Loaded",
      description: `Applied ${presetName} field mapping preset`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Field Mapping for {vendor?.name}
          </DialogTitle>
          <DialogDescription>
            Configure how columns in your CSV/Excel files map to product fields. This ensures accurate data import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Quick Presets */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Presets</CardTitle>
              <CardDescription>
                Load common field mappings to get started quickly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPreset('shopify')}
                  className="flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Shopify Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPreset('basic')}
                  className="flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Basic Fields
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPreset('wholesale')}
                  className="flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Wholesale
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Field Mappings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Field Mappings</CardTitle>
              <CardDescription>
                Map your file columns to product fields. Required fields are marked with a red asterisk.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PRODUCT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1">
                      {field.label}
                      {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={mapping[field.key as keyof FieldMapping] || "__skip__"}
                        onValueChange={(value) => handleMappingChange(field.key as keyof FieldMapping, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select column..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">-- Skip this field --</SelectItem>
                          {COMMON_COLUMN_NAMES.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-gray-500 min-w-0 flex-1">
                        {field.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Custom Column Names */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Custom Column Names</CardTitle>
              <CardDescription>
                Don't see your column name? Type it manually below for any field.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PRODUCT_FIELDS.slice(0, 6).map((field) => (
                  <div key={`custom-${field.key}`} className="space-y-2">
                    <Label className="text-sm font-medium">{field.label}</Label>
                    <Input
                      placeholder="Type exact column name..."
                      value={mapping[field.key as keyof FieldMapping]}
                      onChange={(e) => handleMappingChange(field.key as keyof FieldMapping, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mapping Preview</CardTitle>
              <CardDescription>
                Review your field mappings before saving
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {PRODUCT_FIELDS.filter(f => mapping[f.key as keyof FieldMapping]).map((field) => (
                  <div key={`preview-${field.key}`} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm font-medium">{field.label}</span>
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <code className="text-sm bg-white px-2 py-1 rounded border">
                        {mapping[field.key as keyof FieldMapping]}
                      </code>
                      {field.required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saveMappingMutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saveMappingMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Save Mapping
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}