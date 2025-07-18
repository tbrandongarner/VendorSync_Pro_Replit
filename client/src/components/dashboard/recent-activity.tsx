import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Bot, UserPlus, FolderSync, Activity } from "lucide-react";
import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

export default function RecentActivity() {
  const { isAuthenticated } = useAuth();
  const { lastMessage } = useWebSocket();

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["/api/activities"],
    enabled: isAuthenticated,
  });

  // Handle real-time activity updates
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'activity_update') {
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    }
  }, [lastMessage]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'vendor_sync':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'ai_generation':
        return <Bot className="w-4 h-4 text-purple-600" />;
      case 'vendor_onboard':
        return <UserPlus className="w-4 h-4 text-blue-600" />;
      case 'sync_complete':
        return <FolderSync className="w-4 h-4 text-emerald-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'vendor_sync':
        return 'bg-green-100';
      case 'ai_generation':
        return 'bg-purple-100';
      case 'vendor_onboard':
        return 'bg-blue-100';
      case 'sync_complete':
        return 'bg-emerald-100';
      default:
        return 'bg-gray-100';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  };

  // Sample activities for when there's no data
  const sampleActivities = [
    {
      id: 1,
      type: 'vendor_sync',
      description: 'Welcome to VendorSync Pro! Start by adding your first vendor.',
      createdAt: new Date().toISOString(),
    },
  ];

  const displayActivities = activities.length > 0 ? activities : sampleActivities;

  return (
    <Card className="polaris-shadow">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-start space-x-3">
                <Skeleton className="w-8 h-8 rounded-full flex-shrink-0 mt-1" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {displayActivities.slice(0, 5).map((activity: any) => (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getActivityColor(activity.type)}`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{activity.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatTimeAgo(activity.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
