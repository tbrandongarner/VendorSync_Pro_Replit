import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, MoreHorizontal } from "lucide-react";
import { Link } from "wouter";

export default function RecentVendors() {
  const { isAuthenticated } = useAuth();

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["/api/vendors"],
    enabled: isAuthenticated,
  });

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

  const formatProductCount = (count: number) => {
    if (count === 0) return 'No products';
    if (count === 1) return '1 product';
    return `${count} products`;
  };

  // Get the 3 most recent vendors
  const recentVendors = vendors.slice(0, 3);

  return (
    <Card className="polaris-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Vendors</CardTitle>
          <Link href="/vendors">
            <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-4">
                  <Skeleton className="w-12 h-12 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : recentVendors.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No vendors yet</p>
            <p className="text-sm text-gray-400 mt-1">Add your first vendor to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentVendors.map((vendor: any) => (
              <div key={vendor.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
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
                  <div>
                    <h3 className="font-medium text-gray-900">{vendor.name}</h3>
                    <p className="text-sm text-gray-600">{formatProductCount(0)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge className={getStatusColor(vendor.status)}>
                    {vendor.status}
                  </Badge>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
