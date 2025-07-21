import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, User, Package, Store } from "lucide-react";

interface ConflictField {
  field: string;
  vendorValue: any;
  localValue: any;
  shopifyValue: any;
  lastModified: {
    vendor?: string;
    local?: string;
    shopify?: string;
  };
}

interface ProductConflict {
  productId: number;
  sku: string;
  conflictingFields: ConflictField[];
  recommendedAction: 'accept_vendor' | 'keep_local' | 'merge' | 'ask_user';
}

interface ConflictResolutionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: ProductConflict[];
  onResolve: (productId: number, resolutions: Record<string, any>) => Promise<void>;
}

export function ConflictResolutionDialog({ 
  isOpen, 
  onClose, 
  conflicts, 
  onResolve 
}: ConflictResolutionDialogProps) {
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [resolutions, setResolutions] = useState<Record<number, Record<string, any>>>({});
  const [isResolving, setIsResolving] = useState(false);

  const currentConflict = conflicts[currentConflictIndex];

  const handleFieldResolution = (field: string, value: any, source: string) => {
    if (!currentConflict) return;
    
    setResolutions(prev => ({
      ...prev,
      [currentConflict.productId]: {
        ...prev[currentConflict.productId],
        [field]: { value, source }
      }
    }));
  };

  const handleResolveAll = async () => {
    if (!currentConflict) return;
    
    setIsResolving(true);
    try {
      const productResolutions = resolutions[currentConflict.productId] || {};
      const resolvedData = Object.entries(productResolutions).reduce((acc, [field, resolution]) => {
        acc[field] = resolution.value;
        return acc;
      }, {} as Record<string, any>);

      await onResolve(currentConflict.productId, resolvedData);
      
      // Move to next conflict or close
      if (currentConflictIndex < conflicts.length - 1) {
        setCurrentConflictIndex(prev => prev + 1);
      } else {
        onClose();
      }
    } catch (error) {
      console.error('Failed to resolve conflicts:', error);
    } finally {
      setIsResolving(false);
    }
  };

  const formatFieldName = (field: string) => {
    return field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'Not set';
    if (typeof value === 'string' && value.trim() === '') return 'Empty';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'vendor': return <Package className="w-4 h-4" />;
      case 'local': return <User className="w-4 h-4" />;
      case 'shopify': return <Store className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  if (!currentConflict) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span>Resolve Data Conflicts</span>
          </DialogTitle>
          <DialogDescription>
            Product: {currentConflict.sku} • {currentConflictIndex + 1} of {conflicts.length} conflicts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Conflict Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Conflict Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600">
                <strong>Recommended Action:</strong>{' '}
                <Badge variant={
                  currentConflict.recommendedAction === 'accept_vendor' ? 'default' :
                  currentConflict.recommendedAction === 'keep_local' ? 'secondary' :
                  currentConflict.recommendedAction === 'merge' ? 'outline' : 'destructive'
                }>
                  {currentConflict.recommendedAction.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {currentConflict.conflictingFields.length} field(s) have conflicting values that need resolution
              </p>
            </CardContent>
          </Card>

          {/* Field Conflicts */}
          <div className="space-y-4">
            {currentConflict.conflictingFields.map((conflict) => (
              <Card key={conflict.field}>
                <CardHeader>
                  <CardTitle className="text-sm">{formatFieldName(conflict.field)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="vendor" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="vendor" className="flex items-center space-x-2">
                        {getSourceIcon('vendor')}
                        <span>Vendor Data</span>
                      </TabsTrigger>
                      <TabsTrigger value="local" className="flex items-center space-x-2">
                        {getSourceIcon('local')}
                        <span>Local Changes</span>
                      </TabsTrigger>
                      <TabsTrigger value="shopify" className="flex items-center space-x-2">
                        {getSourceIcon('shopify')}
                        <span>Shopify Data</span>
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="vendor" className="space-y-3">
                      <div className="p-3 bg-blue-50 rounded border">
                        <div className="font-medium text-blue-900">
                          {formatValue(conflict.vendorValue)}
                        </div>
                        <div className="text-xs text-blue-600 mt-1">
                          From vendor pricing sheet
                          {conflict.lastModified.vendor && (
                            <span> • {new Date(conflict.lastModified.vendor).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleFieldResolution(conflict.field, conflict.vendorValue, 'vendor')}
                        className="w-full"
                      >
                        Use Vendor Value
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="local" className="space-y-3">
                      <div className="p-3 bg-green-50 rounded border">
                        <div className="font-medium text-green-900">
                          {formatValue(conflict.localValue)}
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          Local changes in your app
                          {conflict.lastModified.local && (
                            <span> • {new Date(conflict.lastModified.local).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFieldResolution(conflict.field, conflict.localValue, 'local')}
                        className="w-full"
                      >
                        Keep Local Value
                      </Button>
                    </TabsContent>
                    
                    <TabsContent value="shopify" className="space-y-3">
                      <div className="p-3 bg-purple-50 rounded border">
                        <div className="font-medium text-purple-900">
                          {formatValue(conflict.shopifyValue)}
                        </div>
                        <div className="text-xs text-purple-600 mt-1">
                          Current value in Shopify
                          {conflict.lastModified.shopify && (
                            <span> • {new Date(conflict.lastModified.shopify).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFieldResolution(conflict.field, conflict.shopifyValue, 'shopify')}
                        className="w-full"
                      >
                        Use Shopify Value
                      </Button>
                    </TabsContent>
                  </Tabs>
                  
                  {/* Show current resolution */}
                  {resolutions[currentConflict.productId]?.[conflict.field] && (
                    <div className="mt-3 p-2 bg-gray-100 rounded text-sm">
                      <strong>Resolution:</strong> Using{' '}
                      {resolutions[currentConflict.productId][conflict.field].source} value:{' '}
                      <span className="font-mono">
                        {formatValue(resolutions[currentConflict.productId][conflict.field].value)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <div className="text-sm text-gray-600">
              Progress: {currentConflictIndex + 1} of {conflicts.length}
            </div>
            <div className="space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleResolveAll}
                disabled={isResolving || Object.keys(resolutions[currentConflict.productId] || {}).length !== currentConflict.conflictingFields.length}
              >
                {isResolving ? 'Resolving...' : 'Apply Resolutions'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}