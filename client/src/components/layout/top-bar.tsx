import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { isConnected } = useWebSocket();

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
              {subtitle && (
                <p className="text-sm text-gray-600">{subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Real-time connection status */}
            <Badge 
              variant={isConnected ? "default" : "secondary"}
              className={isConnected 
                ? "bg-green-100 text-green-800 border-green-200" 
                : "bg-gray-100 text-gray-600 border-gray-200"
              }
            >
              <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {isConnected ? 'Connected' : 'Offline'}
            </Badge>
            
            {/* Custom actions */}
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
