import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Vendors from "@/pages/vendors";
import Products from "@/pages/products";
import UploadedProducts from "@/pages/uploaded-products";
import Stores from "@/pages/stores";
import SyncManager from "@/pages/sync-manager";
import BulkSync from "@/pages/bulk-sync";
import AiContent from "@/pages/ai-content";
import Analytics from "@/pages/analytics";
import PricingManager from "@/pages/pricing-manager";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/layout/sidebar";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <div className="min-h-screen bg-shopify-surface">
      <Sidebar />
      <div className="main-content">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/vendors" component={Vendors} />
          <Route path="/products" component={Products} />
          <Route path="/uploaded-products" component={UploadedProducts} />
          <Route path="/stores" component={Stores} />
          <Route path="/sync" component={SyncManager} />
          <Route path="/bulk-sync" component={BulkSync} />
          <Route path="/ai" component={AiContent} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/pricing" component={PricingManager} />
          <Route path="/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
