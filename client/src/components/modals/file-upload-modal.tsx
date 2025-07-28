import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw, Settings, Info, FileSpreadsheet } from "lucide-react";

interface FileUploadModalProps {
  vendor: any;
  isOpen: boolean;
  onClose: () => void;
  onConfigureFields?: () => void;
}

export default function FileUploadModal({ vendor, isOpen, onClose, onConfigureFields }: FileUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadResults, setUploadResults] = useState<any>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [showSheetSelection, setShowSheetSelection] = useState(false);

  const analyzeSheetsMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`/api/files/excel/sheets`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to analyze Excel file');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setAvailableSheets(data.sheetNames);
      setSelectedSheets([data.sheetNames[0]]); // Select first sheet by default
      setShowSheetSelection(true);
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze Excel file",
        variant: "destructive",
      });
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      // Add selected sheets for Excel files
      if (selectedSheets.length > 0 && file.name.match(/\.(xlsx|xls)$/i)) {
        formData.append('selectedSheets', JSON.stringify(selectedSheets));
      }
      
      const response = await fetch(`/api/files/vendor/${vendor.id}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setUploadResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: "Upload Successful",
        description: `${data.totalProducts} products parsed from file`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/sync/vendor/${vendor.id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sync/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({
        title: "Sync Started",
        description: "Products are being synced to Shopify",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: "Failed to start sync process",
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
    
    // For Excel files, analyze sheets first
    if (file.name.match(/\.(xlsx|xls)$/i)) {
      analyzeSheetsMutation.mutate(file);
    } else {
      // For CSV files, upload directly
      setShowSheetSelection(false);
      uploadMutation.mutate(file);
    }
  };

  const handleSheetToggle = (sheetName: string, checked: boolean) => {
    if (checked) {
      setSelectedSheets(prev => [...prev, sheetName]);
    } else {
      setSelectedSheets(prev => prev.filter(s => s !== sheetName));
    }
  };

  const handleSelectAllSheets = () => {
    setSelectedSheets(availableSheets);
  };

  const handleDeselectAllSheets = () => {
    setSelectedSheets([]);
  };

  const handleProceedWithSheets = () => {
    if (selectedFile && selectedSheets.length > 0) {
      setShowSheetSelection(false);
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleClose = () => {
    setUploadResults(null);
    setIsDragOver(false);
    setSelectedFile(null);
    setAvailableSheets([]);
    setSelectedSheets([]);
    setShowSheetSelection(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Products for {vendor?.name}</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file containing product data to sync with Shopify
          </DialogDescription>
        </DialogHeader>
        
        {showSheetSelection && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Select Excel Sheets
              </CardTitle>
              <CardDescription>
                Choose which sheets to import from "{selectedFile?.name}". 
                You can select multiple sheets to combine their data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectAllSheets}
                  disabled={selectedSheets.length === availableSheets.length}
                >
                  Select All
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDeselectAllSheets}
                  disabled={selectedSheets.length === 0}
                >
                  Deselect All
                </Button>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableSheets.map((sheetName) => (
                  <div key={sheetName} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sheet-${sheetName}`}
                      checked={selectedSheets.includes(sheetName)}
                      onCheckedChange={(checked) => handleSheetToggle(sheetName, checked as boolean)}
                    />
                    <label 
                      htmlFor={`sheet-${sheetName}`} 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {sheetName}
                    </label>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {selectedSheets.length} of {availableSheets.length} sheets selected
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowSheetSelection(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleProceedWithSheets}
                    disabled={selectedSheets.length === 0}
                  >
                    Import Selected Sheets
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {/* Field Mapping Status */}
          {vendor && (
            <Card className={vendor.dataSourceConfig ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {vendor.dataSourceConfig ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-800">Field mapping configured</p>
                          <p className="text-sm text-green-600">Your data columns are mapped and ready for import</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Info className="w-5 h-5 text-yellow-600" />
                        <div>
                          <p className="font-medium text-yellow-800">Field mapping not configured</p>
                          <p className="text-sm text-yellow-600">Set up field mapping for accurate imports</p>
                        </div>
                      </>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (onConfigureFields) {
                        onClose();
                        onConfigureFields();
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Configure
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!uploadResults && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver 
                  ? 'border-emerald-400 bg-emerald-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {uploadMutation.isPending ? 'Uploading...' : 'Upload Product File'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Drag and drop your CSV or Excel file here, or click to browse
              </p>
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {uploadMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Choose File
                  </>
                )}
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileInputChange}
                className="hidden"
              />
              
              <p className="text-xs text-gray-500 mt-4">
                Supported formats: CSV, Excel (.xlsx, .xls)
              </p>
            </div>
          )}

          {uploadResults && (
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <CardTitle className="text-lg">Upload Results</CardTitle>
                </div>
                <CardDescription>
                  File processed successfully
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {uploadResults.totalProducts}
                    </div>
                    <div className="text-sm text-green-700">Valid Products</div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {uploadResults.validProducts || uploadResults.totalProducts}
                    </div>
                    <div className="text-sm text-blue-700">Ready to Sync</div>
                  </div>
                </div>

                {uploadResults.errors && uploadResults.errors.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mr-2" />
                      <h4 className="font-medium text-yellow-800">Warnings</h4>
                    </div>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {uploadResults.errors.slice(0, 3).map((error: string, index: number) => (
                        <li key={index}>• {error}</li>
                      ))}
                      {uploadResults.errors.length > 3 && (
                        <li>• And {uploadResults.errors.length - 3} more...</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">Next Steps</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Products are ready to sync to your Shopify store</li>
                    <li>• You can sync now or save for later</li>
                    <li>• Unsynced products will show indicators in the Products tab</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="space-x-2">
          <Button variant="outline" onClick={handleClose}>
            {uploadResults ? 'Save for Later' : 'Cancel'}
          </Button>
          {uploadResults && (
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {syncMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync to Shopify
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}