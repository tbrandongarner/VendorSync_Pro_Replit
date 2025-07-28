import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Handshake, 
  BarChart3, 
  Users, 
  Package, 
  Store, 
  FolderSync, 
  Bot, 
  Settings,
  Menu,
  X,
  Upload,
  DollarSign
} from "lucide-react";

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    { name: 'Vendors', href: '/vendors', icon: Users },
    { name: 'Products', href: '/products', icon: Package },
    { name: 'Uploaded Products', href: '/uploaded-products', icon: Upload },
    { name: 'Stores', href: '/stores', icon: Store },
    { name: 'Synchronization', href: '/sync', icon: FolderSync },
    { name: 'Pricing Manager', href: '/pricing', icon: DollarSign },
    { name: 'AI Content', href: '/ai', icon: Bot },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return location === '/';
    }
    return location.startsWith(href);
  };

  const handleMobileToggle = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const closeMobile = () => {
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="sm"
        className="md:hidden fixed top-4 left-4 z-50 bg-white shadow-md"
        onClick={handleMobileToggle}
      >
        {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <div className={`
        sidebar-width bg-white border-r border-gray-200 h-screen fixed left-0 top-0 overflow-y-auto polaris-shadow z-50
        ${isMobileOpen ? 'sidebar-open' : ''}
        md:translate-x-0 transition-transform duration-300
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Handshake className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">VendorSync Pro</h1>
              <p className="text-xs text-gray-500">Vendor Management</p>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.name} href={item.href} onClick={closeMobile}>
                <div className={`
                  flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors cursor-pointer
                  ${isActive(item.href) 
                    ? 'bg-emerald-600 text-white' 
                    : 'hover:bg-gray-100 text-gray-700'
                  }
                `}>
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        
        {/* User Profile */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-3">
              <Avatar className="w-8 h-8">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || undefined} />
                <AvatarFallback className="bg-emerald-100 text-emerald-600 text-sm">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
