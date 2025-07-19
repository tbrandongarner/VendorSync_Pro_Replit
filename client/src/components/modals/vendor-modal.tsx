import { useState, useEffect } from "react";
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
import { Upload, Save, X } from "lucide-react";
import FileUpload from "@/components/ui/file-upload";

interface VendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor?: any;
}

export default function VendorModal({ isOpen, onClose, vendor }: VendorModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    contactEmail: "",
    logoUrl: "",
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
        logoUrl: vendor.logoUrl || "",
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
        logoUrl: "",
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
          
          <div className="space-y-2">
            <Label htmlFor="logoUrl">Company Logo URL</Label>
            <Input
              id="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              value={formData.logoUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, logoUrl: e.target.value }))}
            />
            <p className="text-xs text-gray-500">
              URL to vendor's logo image (PNG, JPG, or SVG)
            </p>
          </div>
          
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
