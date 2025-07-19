import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface FileUploadProps {
  vendorId: number;
  dataSourceType: string;
  onUploadSuccess?: (data: any) => void;
}

export default function FileUpload({ vendorId, dataSourceType, onUploadSuccess }: FileUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = {
      'csv_upload': ['text/csv', 'application/csv'],
      'excel_upload': [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ]
    };

    const validTypes = allowedTypes[dataSourceType as keyof typeof allowedTypes];
    if (validTypes && !validTypes.includes(file.type) && 
        !validTypes.some(type => type.includes(file.name.split('.').pop() || ''))) {
      toast({
        title: 'Invalid File Type',
        description: `Please select a ${dataSourceType === 'csv_upload' ? 'CSV' : 'Excel'} file`,
        variant: 'destructive'
      });
      return;
    }

    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/files/vendor/${vendorId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'Upload failed');
      }

      const result = await response.json();
      setUploadResult(result);
      
      toast({
        title: 'File Uploaded Successfully',
        description: `Found ${result.validProducts} valid products from ${result.totalProducts} total rows`,
      });

      onUploadSuccess?.(result);
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  if (dataSourceType !== 'csv_upload' && dataSourceType !== 'excel_upload') {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept={dataSourceType === 'csv_upload' ? '.csv' : '.xlsx,.xls'}
          className="hidden"
        />
        
        <div className="space-y-2">
          <FileText className="w-8 h-8 mx-auto text-gray-400" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              Upload your {dataSourceType === 'csv_upload' ? 'CSV' : 'Excel'} file
            </p>
            <p className="text-xs text-gray-500">
              File should contain product data with SKU, Name, Price columns
            </p>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            onClick={triggerFileSelect}
            disabled={uploading}
            className="mt-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Choose File
              </>
            )}
          </Button>
        </div>
      </div>

      {uploadResult && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-sm mb-2 flex items-center">
            {uploadResult.success ? (
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 mr-2" />
            )}
            Upload Results
          </h4>
          
          <div className="space-y-1 text-sm text-gray-600">
            <p>Total rows processed: {uploadResult.totalProducts}</p>
            <p className="text-green-600">Valid products: {uploadResult.validProducts}</p>
            {uploadResult.invalidProducts > 0 && (
              <p className="text-red-600">Invalid products: {uploadResult.invalidProducts}</p>
            )}
            
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-red-600 font-medium text-xs">Errors:</p>
                {uploadResult.errors.map((error: string, index: number) => (
                  <p key={index} className="text-red-600 text-xs">• {error}</p>
                ))}
              </div>
            )}
          </div>

          {uploadResult.products && uploadResult.products.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Sample Products:</p>
              <div className="bg-white rounded border max-h-32 overflow-y-auto">
                <div className="text-xs">
                  {uploadResult.products.slice(0, 3).map((product: any, index: number) => (
                    <div key={index} className="p-2 border-b last:border-b-0">
                      <span className="font-medium">{product.sku}</span> - {product.name}
                      {product.price && <span className="text-gray-500 ml-2">${product.price}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}