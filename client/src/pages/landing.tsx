import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Handshake, Users, Bot, FolderSync, BarChart3, Store } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mr-4">
              <Handshake className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">VendorSync Pro</h1>
              <p className="text-lg text-gray-600">Professional Vendor Management Platform</p>
            </div>
          </div>
          <p className="text-xl text-gray-700 max-w-3xl mx-auto mb-8">
            Streamline your Shopify vendor relationships with AI-powered content generation,
            real-time synchronization, and comprehensive analytics.
          </p>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            size="lg"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3"
          >
            Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <Card className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardHeader>
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <CardTitle>Vendor Management</CardTitle>
              <CardDescription>
                Centralized vendor onboarding, profile management, and relationship tracking.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <FolderSync className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>Real-time FolderSync</CardTitle>
              <CardDescription>
                Automatic product synchronization across multiple Shopify stores with live updates.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Bot className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle>AI Content Generation</CardTitle>
              <CardDescription>
                Generate compelling product descriptions and SEO-optimized content automatically.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardHeader>
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                <Store className="w-6 h-6 text-yellow-600" />
              </div>
              <CardTitle>Multi-Store Support</CardTitle>
              <CardDescription>
                Manage products across multiple Shopify stores from a single dashboard.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle>Advanced Analytics</CardTitle>
              <CardDescription>
                Comprehensive reporting and insights to optimize vendor relationships.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="polaris-shadow hover:polaris-shadow-hover transition-all">
            <CardHeader>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Handshake className="w-6 h-6 text-red-600" />
              </div>
              <CardTitle>Shopify Native</CardTitle>
              <CardDescription>
                Built specifically for Shopify with native integrations and familiar UI patterns.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto polaris-shadow">
            <CardContent className="p-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Ready to Transform Your Vendor Management?
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Join thousands of merchants who trust VendorSync Pro to streamline their operations.
              </p>
              <Button 
                onClick={() => window.location.href = '/api/login'}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3"
              >
                Start Free Trial
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
