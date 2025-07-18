import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, FolderSync, Bot } from "lucide-react";
import VendorModal from "@/components/modals/vendor-modal";
import { useToast } from "@/hooks/use-toast";

export default function QuickActions() {
  const { toast } = useToast();
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);

  const handleBulkSync = () => {
    toast({
      title: "Bulk FolderSync Started",
      description: "Synchronizing all products across vendors",
    });
  };

  const handleGenerateContent = () => {
    toast({
      title: "AI Content Generation",
      description: "Redirecting to AI content generator",
    });
    // Navigate to AI content page
    window.location.href = "/ai";
  };

  const quickActions = [
    {
      title: "Onboard Vendor",
      description: "Start vendor setup",
      icon: UserPlus,
      color: "bg-emerald-100 text-emerald-600",
      action: () => setIsVendorModalOpen(true),
    },
    {
      title: "Bulk FolderSync",
      description: "FolderSync all products",
      icon: FolderSync,
      color: "bg-blue-100 text-blue-600",
      action: handleBulkSync,
    },
    {
      title: "AI Content",
      description: "Generate descriptions",
      icon: Bot,
      color: "bg-purple-100 text-purple-600",
      action: handleGenerateContent,
    },
  ];

  return (
    <>
      <Card className="polaris-shadow">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="w-full justify-start p-3 h-auto border-gray-200 hover:bg-gray-50"
                onClick={action.action}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 ${action.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">{action.title}</p>
                  <p className="text-xs text-gray-500">{action.description}</p>
                </div>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <VendorModal
        isOpen={isVendorModalOpen}
        onClose={() => setIsVendorModalOpen(false)}
      />
    </>
  );
}
