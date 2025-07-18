import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Package, Store, Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsCards() {
  const { isAuthenticated } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="polaris-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
              <Skeleton className="h-4 w-32 mt-4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statsData = [
    {
      title: "Active Vendors",
      value: stats?.activeVendors || 0,
      change: "+2",
      changeText: "from last month",
      icon: Users,
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      title: "Synced Products",
      value: stats?.syncedProducts || 0,
      change: "+127",
      changeText: "this week",
      icon: Package,
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "Connected Stores",
      value: stats?.connectedStores || 0,
      change: "All stores active",
      changeText: "",
      icon: Store,
      color: "bg-yellow-100 text-yellow-600",
    },
    {
      title: "AI Generated",
      value: stats?.aiGenerated || 0,
      change: "89%",
      changeText: "success rate",
      icon: Bot,
      color: "bg-purple-100 text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statsData.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card key={index} className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">
                    {stat.value.toLocaleString()}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex items-center mt-4 text-sm">
                <span className="text-emerald-600 font-medium">{stat.change}</span>
                {stat.changeText && (
                  <span className="text-gray-500 ml-1">{stat.changeText}</span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
