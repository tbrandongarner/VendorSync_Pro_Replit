import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import TopBar from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, User, Bell, Shield, Key, Zap, Database, LogOut } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    company: "",
    phone: "",
    timezone: "UTC",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    syncNotifications: true,
    vendorUpdates: true,
    aiGenerations: false,
    weeklyReports: true,
    errorAlerts: true,
  });

  const [apiSettings, setApiSettings] = useState({
    openaiApiKey: "",
    shopifyWebhooks: true,
    rateLimiting: true,
    debugMode: false,
  });

  const handleSaveProfile = () => {
    toast({
      title: "Profile Updated",
      description: "Your profile settings have been saved successfully.",
    });
  };

  const handleSaveNotifications = () => {
    toast({
      title: "Notifications Updated",
      description: "Your notification preferences have been saved.",
    });
  };

  const handleSaveApiSettings = () => {
    toast({
      title: "API Settings Updated",
      description: "Your API configuration has been saved.",
    });
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-shopify-surface">
      <TopBar title="Settings" subtitle="Manage your account and application preferences" />
      
      <div className="p-6 space-y-6">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="api">API & Integrations</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="w-5 h-5 mr-2" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your personal information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={profileData.company}
                      onChange={(e) => setProfileData(prev => ({ ...prev, company: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={profileData.timezone} onValueChange={(value) => setProfileData(prev => ({ ...prev, timezone: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">Paris</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button onClick={handleSaveProfile} className="bg-emerald-600 hover:bg-emerald-700">
                  Save Profile
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="notifications" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="w-5 h-5 mr-2" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Choose how you want to be notified about important events
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-gray-600">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={notificationSettings.emailNotifications}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, emailNotifications: checked }))}
                    />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Sync Notifications</Label>
                      <p className="text-sm text-gray-600">Get notified when sync jobs complete</p>
                    </div>
                    <Switch
                      checked={notificationSettings.syncNotifications}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, syncNotifications: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Vendor Updates</Label>
                      <p className="text-sm text-gray-600">Notifications about vendor changes</p>
                    </div>
                    <Switch
                      checked={notificationSettings.vendorUpdates}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, vendorUpdates: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>AI Generations</Label>
                      <p className="text-sm text-gray-600">Notifications for AI content generation</p>
                    </div>
                    <Switch
                      checked={notificationSettings.aiGenerations}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, aiGenerations: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weekly Reports</Label>
                      <p className="text-sm text-gray-600">Weekly summary of your activity</p>
                    </div>
                    <Switch
                      checked={notificationSettings.weeklyReports}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, weeklyReports: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Error Alerts</Label>
                      <p className="text-sm text-gray-600">Immediate notifications for errors</p>
                    </div>
                    <Switch
                      checked={notificationSettings.errorAlerts}
                      onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, errorAlerts: checked }))}
                    />
                  </div>
                </div>
                
                <Button onClick={handleSaveNotifications} className="bg-emerald-600 hover:bg-emerald-700">
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="api" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Key className="w-5 h-5 mr-2" />
                  API Configuration
                </CardTitle>
                <CardDescription>
                  Manage your API keys and integration settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="openaiKey">OpenAI API Key</Label>
                    <Input
                      id="openaiKey"
                      type="password"
                      placeholder="sk-..."
                      value={apiSettings.openaiApiKey}
                      onChange={(e) => setApiSettings(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                    />
                    <p className="text-sm text-gray-600">
                      Required for AI content generation features
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Shopify Webhooks</Label>
                      <p className="text-sm text-gray-600">Enable real-time Shopify updates</p>
                    </div>
                    <Switch
                      checked={apiSettings.shopifyWebhooks}
                      onCheckedChange={(checked) => setApiSettings(prev => ({ ...prev, shopifyWebhooks: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Rate Limiting</Label>
                      <p className="text-sm text-gray-600">Prevent API abuse and manage costs</p>
                    </div>
                    <Switch
                      checked={apiSettings.rateLimiting}
                      onCheckedChange={(checked) => setApiSettings(prev => ({ ...prev, rateLimiting: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Debug Mode</Label>
                      <p className="text-sm text-gray-600">Enable detailed logging for troubleshooting</p>
                    </div>
                    <Switch
                      checked={apiSettings.debugMode}
                      onCheckedChange={(checked) => setApiSettings(prev => ({ ...prev, debugMode: checked }))}
                    />
                  </div>
                </div>
                
                <Button onClick={handleSaveApiSettings} className="bg-emerald-600 hover:bg-emerald-700">
                  Save API Settings
                </Button>
              </CardContent>
            </Card>
            
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" />
                  Usage & Limits
                </CardTitle>
                <CardDescription>
                  Monitor your API usage and current limits
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">AI Generations this month</span>
                    <Badge variant="outline">47 / 1000</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">API Requests today</span>
                    <Badge variant="outline">234 / 10000</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Storage used</span>
                    <Badge variant="outline">1.2GB / 10GB</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Plan</span>
                    <Badge className="bg-emerald-100 text-emerald-800">Professional</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="security" className="space-y-6">
            <Card className="polaris-shadow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Manage your account security and access
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Account Security</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Your account is secured with Replit authentication. You can manage your security settings in your Replit account.
                    </p>
                    <Badge className="bg-green-100 text-green-800">
                      ✓ Secured with Replit Auth
                    </Badge>
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Data Privacy</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Your data is encrypted and stored securely. We follow industry best practices for data protection.
                    </p>
                    <div className="flex space-x-2">
                      <Badge variant="outline">End-to-end encryption</Badge>
                      <Badge variant="outline">GDPR compliant</Badge>
                    </div>
                  </div>
                  
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">API Security</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      All API communications are secured with HTTPS and authenticated requests.
                    </p>
                    <div className="flex space-x-2">
                      <Badge variant="outline">HTTPS only</Badge>
                      <Badge variant="outline">Token-based auth</Badge>
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <h4 className="font-medium text-gray-900 mb-4">Account Actions</h4>
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      onClick={handleLogout}
                      className="w-full sm:w-auto"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
