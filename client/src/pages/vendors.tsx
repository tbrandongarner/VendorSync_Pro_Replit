import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import TopBar from "@/components/layout/top-bar";
import VendorModal from "@/components/modals/vendor-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users, Mail, Globe, MoreHorizontal, Phone, User, Headphones, DollarSign } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Vendors() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (vendorId: number) => {
      await apiRequest("DELETE", `/api/vendors/${vendorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      toast({
        title: "Success",
        description: "Vendor deleted successfully",
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
        description: "Failed to delete vendor",
        variant: "destructive",
      });
    },
  });

  const filteredVendors = vendors.filter((vendor: any) =>
    vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vendor.contactEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddVendor = () => {
    setEditingVendor(null);
    setIsModalOpen(true);
  };

  const handleEditVendor = (vendor: any) => {
    setEditingVendor(vendor);
    setIsModalOpen(true);
  };

  const handleDeleteVendor = async (vendor: any) => {
    if (window.confirm(`Are you sure you want to delete ${vendor.name}? This action cannot be undone.`)) {
      deleteVendorMutation.mutate(vendor.id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'syncing':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Vendors" subtitle="Manage your vendor relationships and partnerships" />
      
      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Button onClick={handleAddVendor} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Add Vendor
          </Button>
        </div>

        {/* Vendors Grid */}
        {vendorsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="polaris-shadow">
                <CardHeader className="animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredVendors.length === 0 ? (
          <Card className="polaris-shadow">
            <CardContent className="text-center py-16">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm ? 'No vendors found' : 'No vendors yet'}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm 
                  ? 'Try adjusting your search terms'
                  : 'Start by adding your first vendor to begin managing your partnerships'
                }
              </p>
              {!searchTerm && (
                <Button onClick={handleAddVendor} className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Vendor
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVendors.map((vendor: any) => (
              <Card key={vendor.id} className="polaris-shadow hover:polaris-shadow-hover transition-all">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {vendor.logoUrl ? (
                        <img
                          src={vendor.logoUrl}
                          alt={vendor.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                          <Users className="w-6 h-6 text-emerald-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{vendor.name}</CardTitle>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center">
                            <Mail className="w-3 h-3 mr-1" />
                            {vendor.contactEmail}
                          </div>
                          {vendor.phone && (
                            <div className="flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              {vendor.phone}
                            </div>
                          )}
                          {vendor.website && (
                            <div className="flex items-center">
                              <Globe className="w-3 h-3 mr-1" />
                              <a href={vendor.website} target="_blank" rel="noopener noreferrer" 
                                 className="text-blue-600 hover:underline text-xs truncate">
                                {vendor.website}
                              </a>
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditVendor(vendor)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteVendor(vendor)}
                          className="text-red-600"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status</span>
                      <Badge className={getStatusColor(vendor.status)}>
                        {vendor.status}
                      </Badge>
                    </div>
                    
                    {vendor.commissionRate && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Commission</span>
                        <span className="text-sm font-medium">{vendor.commissionRate}%</span>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Sync Frequency</span>
                      <span className="text-sm font-medium capitalize">{vendor.syncFrequency}</span>
                    </div>
                    
                    {vendor.apiEndpoint && (
                      <div className="flex items-center space-x-2">
                        <Globe className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-500 truncate">API Connected</span>
                      </div>
                    )}
                    
                    {vendor.lastSyncAt && (
                      <div className="text-xs text-gray-500">
                        Last sync: {new Date(vendor.lastSyncAt).toLocaleDateString()}
                      </div>
                    )}

                    {/* Additional Contacts */}
                    {(vendor.secondaryContactName || vendor.secondaryContactEmail || vendor.secondaryContactPhone || 
                      vendor.supportEmail || vendor.supportPhone || vendor.salesEmail || vendor.salesPhone) && (
                      <div className="pt-2 border-t space-y-2">
                        {/* Secondary Contact */}
                        {(vendor.secondaryContactName || vendor.secondaryContactEmail || vendor.secondaryContactPhone) && (
                          <div>
                            <div className="text-xs font-medium text-gray-800 mb-1 flex items-center">
                              <User className="w-3 h-3 mr-1" />
                              Secondary Contact
                            </div>
                            {vendor.secondaryContactName && (
                              <div className="text-xs text-gray-600">{vendor.secondaryContactName}</div>
                            )}
                            {vendor.secondaryContactEmail && (
                              <div className="text-xs text-gray-600 flex items-center">
                                <Mail className="w-3 h-3 mr-1" />
                                {vendor.secondaryContactEmail}
                              </div>
                            )}
                            {vendor.secondaryContactPhone && (
                              <div className="text-xs text-gray-600 flex items-center">
                                <Phone className="w-3 h-3 mr-1" />
                                {vendor.secondaryContactPhone}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Support Contact */}
                        {(vendor.supportEmail || vendor.supportPhone) && (
                          <div>
                            <div className="text-xs font-medium text-gray-800 mb-1 flex items-center">
                              <Headphones className="w-3 h-3 mr-1" />
                              Support
                            </div>
                            {vendor.supportEmail && (
                              <div className="text-xs text-gray-600 flex items-center">
                                <Mail className="w-3 h-3 mr-1" />
                                {vendor.supportEmail}
                              </div>
                            )}
                            {vendor.supportPhone && (
                              <div className="text-xs text-gray-600 flex items-center">
                                <Phone className="w-3 h-3 mr-1" />
                                {vendor.supportPhone}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sales Contact */}
                        {(vendor.salesEmail || vendor.salesPhone) && (
                          <div>
                            <div className="text-xs font-medium text-gray-800 mb-1 flex items-center">
                              <DollarSign className="w-3 h-3 mr-1" />
                              Sales
                            </div>
                            {vendor.salesEmail && (
                              <div className="text-xs text-gray-600 flex items-center">
                                <Mail className="w-3 h-3 mr-1" />
                                {vendor.salesEmail}
                              </div>
                            )}
                            {vendor.salesPhone && (
                              <div className="text-xs text-gray-600 flex items-center">
                                <Phone className="w-3 h-3 mr-1" />
                                {vendor.salesPhone}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <VendorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vendor={editingVendor}
      />
    </div>
  );
}
