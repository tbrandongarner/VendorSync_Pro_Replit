import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Upload, Save, X, User, Phone, Mail, Globe, Camera, Headphones, DollarSign } from "lucide-react";
import FileUpload from "@/components/ui/file-upload";

interface VendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor?: any;
}

export default function VendorModal({ isOpen, onClose, vendor }: VendorModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    contactEmail: "",
    phone: "",
    website: "",
    logoUrl: "",
    secondaryContactName: "",
    secondaryContactEmail: "",
    secondaryContactPhone: "",
    supportEmail: "",
    supportPhone: "",
    salesEmail: "",
    salesPhone: "",
    commissionRate: "",
    syncFrequency: "daily",
    dataSourceType: "csv_upload",
    dataSourceUrl: "",
    dataSourceConfig: "",
    notes: "",
  });

  // Reset form when vendor changes
  useEffect(() => {
    if (vendor) {
      setFormData({
        name: vendor.name || "",
        contactEmail: vendor.contactEmail || "",
        phone: vendor.phone || "",
        website: vendor.website || "",
        logoUrl: vendor.logoUrl || "",
        secondaryContactName: vendor.secondaryContactName || "",
        secondaryContactEmail: vendor.secondaryContactEmail || "",
        secondaryContactPhone: vendor.secondaryContactPhone || "",
        supportEmail: vendor.supportEmail || "",
        supportPhone: vendor.supportPhone || "",
        salesEmail: vendor.salesEmail || "",
        salesPhone: vendor.salesPhone || "",
        commissionRate: vendor.commissionRate || "",
        syncFrequency: vendor.syncFrequency || "daily",
        dataSourceType: vendor.dataSourceType || "csv_upload",
        dataSourceUrl: vendor.dataSourceUrl || "",
        dataSourceConfig: vendor.dataSourceConfig || "",
        notes: vendor.notes || "",
      });
    } else {
      setFormData({
        name: "",
        contactEmail: "",
        phone: "",
        website: "",
        logoUrl: "",
        secondaryContactName: "",
        secondaryContactEmail: "",
        secondaryContactPhone: "",
        supportEmail: "",
        supportPhone: "",
        salesEmail: "",
        salesPhone: "",
        commissionRate: "",
        syncFrequency: "daily",
        dataSourceType: "csv_upload",
        dataSourceUrl: "",
        dataSourceConfig: "",
        notes: "",
      });
    }
  }, [vendor]);

  const createVendorMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/vendors", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Vendor created successfully",
      });
      onClose();
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
        description: "Failed to create vendor",
        variant: "destructive",
      });
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/vendors/${vendor.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: "Success",
        description: "Vendor updated successfully",
      });
      onClose();
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
        description: "Failed to update vendor",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.contactEmail) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const submitData = {
      ...formData,
      commissionRate: formData.commissionRate ? parseFloat(formData.commissionRate) : null,
    };

    if (vendor) {
      updateVendorMutation.mutate(submitData);
    } else {
      createVendorMutation.mutate(submitData);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('logo', file);
      
      // Use direct fetch instead of apiRequest to properly handle FormData
      const response = await fetch("/api/upload/logo", {
        method: "POST",
        body: uploadFormData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const { logoUrl } = await response.json();
      
      setFormData(prev => ({ ...prev, logoUrl }));
      toast({
        title: "Success",
        description: "Logo uploaded successfully",
      });
    } catch (error) {
      console.error("Logo upload failed:", error);
      toast({
        title: "Error",
        description: "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const isPending = createVendorMutation.isPending || updateVendorMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {vendor ? "Edit Vendor" : "Add New Vendor"}
          </DialogTitle>
          <DialogDescription>
            {vendor ? "Update vendor information and settings" : "Create a new vendor partnership"}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Vendor Name *</Label>
              <Input
                id="name"
                placeholder="Enter vendor name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email *</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="vendor@company.com"
                value={formData.contactEmail}
                onChange={(e) => setFormData(prev => ({ ...prev, contactEmail: e.target.value }))}
                required
              />
            </div>
          </div>
          
          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">
                <Phone className="w-4 h-4 inline mr-2" />
                Phone Number
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="website">
                <Globe className="w-4 h-4 inline mr-2" />
                Website
              </Label>
              <Input
                id="website"
                type="url"
                placeholder="https://company.com"
                value={formData.website}
                onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
              />
            </div>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label>
              <Camera className="w-4 h-4 inline mr-2" />
              Company Logo
            </Label>
            <div className="flex items-center space-x-4">
              {formData.logoUrl && (
                <div className="w-16 h-16 bg-gray-50 rounded border overflow-hidden flex items-center justify-center">
                  <img 
                    src={formData.logoUrl} 
                    alt="Vendor logo preview" 
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={triggerFileUpload}
                  disabled={isUploading}
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Uploading..." : "Upload Logo"}
                </Button>
                <p className="text-xs text-gray-500 mt-1">
                  PNG, JPG, GIF, or WebP (max 5MB)
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Secondary Contact */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 flex items-center">
              <User className="w-4 h-4 mr-2" />
              Secondary Contact (Optional)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="secondaryContactName">Name</Label>
                <Input
                  id="secondaryContactName"
                  placeholder="John Smith"
                  value={formData.secondaryContactName}
                  onChange={(e) => setFormData(prev => ({ ...prev, secondaryContactName: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="secondaryContactEmail">Email</Label>
                <Input
                  id="secondaryContactEmail"
                  type="email"
                  placeholder="john@company.com"
                  value={formData.secondaryContactEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, secondaryContactEmail: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="secondaryContactPhone">Phone</Label>
                <Input
                  id="secondaryContactPhone"
                  type="tel"
                  placeholder="+1 (555) 987-6543"
                  value={formData.secondaryContactPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, secondaryContactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Support Contact */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 flex items-center">
              <Headphones className="w-4 h-4 mr-2" />
              Support Contact (Optional)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supportEmail">Support Email</Label>
                <Input
                  id="supportEmail"
                  type="email"
                  placeholder="support@company.com"
                  value={formData.supportEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, supportEmail: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="supportPhone">Support Phone</Label>
                <Input
                  id="supportPhone"
                  type="tel"
                  placeholder="+1 (555) 123-HELP"
                  value={formData.supportPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, supportPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Sales Contact */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-900 flex items-center">
              <DollarSign className="w-4 h-4 mr-2" />
              Sales Contact (Optional)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesEmail">Sales Email</Label>
                <Input
                  id="salesEmail"
                  type="email"
                  placeholder="sales@company.com"
                  value={formData.salesEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, salesEmail: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="salesPhone">Sales Phone</Label>
                <Input
                  id="salesPhone"
                  type="tel"
                  placeholder="+1 (555) 123-SALE"
                  value={formData.salesPhone}
                  onChange={(e) => setFormData(prev => ({ ...prev, salesPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="commissionRate">Commission Rate (%)</Label>
              <Input
                id="commissionRate"
                type="number"
                placeholder="10"
                min="0"
                max="100"
                step="0.1"
                value={formData.commissionRate}
                onChange={(e) => setFormData(prev => ({ ...prev, commissionRate: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="syncFrequency">Sync Frequency</Label>
              <Select value={formData.syncFrequency} onValueChange={(value) => setFormData(prev => ({ ...prev, syncFrequency: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Every hour</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="manual">Manual only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h4 className="font-semibold flex items-center">
              <Upload className="w-4 h-4 mr-2" />
              Product Data Source
            </h4>
            
            <div className="space-y-2">
              <Label htmlFor="dataSourceType">Data Source Type</Label>
              <Select value={formData.dataSourceType} onValueChange={(value) => setFormData(prev => ({ ...prev, dataSourceType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv_upload">CSV File Upload</SelectItem>
                  <SelectItem value="excel_upload">Excel File Upload</SelectItem>
                  <SelectItem value="google_sheets">Google Sheets</SelectItem>
                  <SelectItem value="api">API Connection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(formData.dataSourceType === 'google_sheets' || formData.dataSourceType === 'api') && (
              <div className="space-y-2">
                <Label htmlFor="dataSourceUrl">
                  {formData.dataSourceType === 'google_sheets' ? 'Google Sheets Share URL' : 'API Endpoint'}
                </Label>
                <Input
                  id="dataSourceUrl"
                  type="url"
                  placeholder={
                    formData.dataSourceType === 'google_sheets' 
                      ? "https://docs.google.com/spreadsheets/d/..." 
                      : "https://vendor-api.example.com"
                  }
                  value={formData.dataSourceUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, dataSourceUrl: e.target.value }))}
                />
                <p className="text-xs text-gray-500">
                  {formData.dataSourceType === 'google_sheets' 
                    ? "Make sure the Google Sheet is publicly viewable or shared with the appropriate permissions"
                    : "REST API endpoint that returns product data"
                  }
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dataSourceConfig">Column Mapping (Optional)</Label>
              <Textarea
                id="dataSourceConfig"
                placeholder={`Configure column mappings (JSON format):
{
  "sku_column": "SKU",
  "name_column": "Product Name", 
  "price_column": "Price",
  "description_column": "Description",
  "inventory_column": "Stock"
}`}
                value={formData.dataSourceConfig}
                onChange={(e) => setFormData(prev => ({ ...prev, dataSourceConfig: e.target.value }))}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500">
                Map your spreadsheet columns to product fields. Leave empty to use default mapping.
              </p>
            </div>

            {vendor && (formData.dataSourceType === 'csv_upload' || formData.dataSourceType === 'excel_upload') && (
              <div className="mt-4">
                <Label>Upload Product File</Label>
                <FileUpload 
                  vendorId={vendor.id} 
                  dataSourceType={formData.dataSourceType}
                  onUploadSuccess={(data) => {
                    toast({
                      title: "File processed successfully",
                      description: `${data.validProducts} products ready for sync`,
                    });
                  }}
                />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about this vendor..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {vendor ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {vendor ? "Update Vendor" : "Create Vendor"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
