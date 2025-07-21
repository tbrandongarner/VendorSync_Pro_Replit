import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle, RefreshCw, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface VendorImportModalProps {
  children: React.ReactNode;
  vendorId: number;
  vendorName: string;
}

export function VendorImportModal({ children, vendorId, vendorName }: VendorImportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const [importMode, setImportMode] = useState<"new_only" | "update_existing" | "both">("both");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('importMode', importMode);
      
      const response = await fetch(`/api/files/vendor/${vendorId}/import`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setUploadResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/uploaded-products"] });
      toast({
        title: "Import Successful",
        description: `${data.newProducts} new, ${data.updatedProducts} updated products`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import vendor data",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast({
        title: "Invalid File Type",
        description: "Please select a CSV or Excel file",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    setUploadResults(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleImport = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const reset = () => {
    setSelectedFile(null);
    setUploadResults(null);
    setImportMode("both");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) reset();
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Products from {vendorName}</DialogTitle>
          <DialogDescription>
            Upload a pricing sheet to update existing products and add new ones
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Import Mode Selection */}
          <div className="space-y-3">
            <Label>Import Mode</Label>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setImportMode("new_only")}
                className={`p-3 border rounded-lg text-left transition-colors ${
                  importMode === "new_only" ? "border-emerald-600 bg-emerald-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">New Products Only</div>
                <div className="text-sm text-gray-600">Add only products that don't exist in your catalog</div>
              </button>
              <button
                onClick={() => setImportMode("update_existing")}
                className={`p-3 border rounded-lg text-left transition-colors ${
                  importMode === "update_existing" ? "border-emerald-600 bg-emerald-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">Update Existing Only</div>
                <div className="text-sm text-gray-600">Update prices and details for existing products (by SKU)</div>
              </button>
              <button
                onClick={() => setImportMode("both")}
                className={`p-3 border rounded-lg text-left transition-colors ${
                  importMode === "both" ? "border-emerald-600 bg-emerald-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium">Add New & Update Existing</div>
                <div className="text-sm text-gray-600">Smart import: add new products and update existing ones</div>
              </button>
            </div>
          </div>

          {/* File Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver ? "border-emerald-400 bg-emerald-50" : "border-gray-300"
            }`}
          >
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-sm text-gray-600">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                <div>
                  <p className="text-lg font-medium">Drop your pricing sheet here</p>
                  <p className="text-gray-600">or click to browse files</p>
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input"
                />
                <Label htmlFor="file-input" className="cursor-pointer">
                  <Button variant="outline" className="mt-2">
                    Select File
                  </Button>
                </Label>
              </div>
            )}
          </div>

          {/* Upload Results */}
          {uploadResults && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium">Import Results</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">{uploadResults.newProducts}</Badge>
                  <span>New products added</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">{uploadResults.updatedProducts}</Badge>
                  <span>Existing products updated</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">{uploadResults.needsSync}</Badge>
                  <span>Products need Shopify sync</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant="destructive">{uploadResults.errors || 0}</Badge>
                  <span>Errors</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedFile || uploadMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {uploadMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Products
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}