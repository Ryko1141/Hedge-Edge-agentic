import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { User, Bell, Shield, Palette, Key, Download, Cpu } from 'lucide-react';
import { LicenseKeySection } from '@/components/dashboard/LicenseKeySection';
import { InstallationManagerModal } from '@/components/dashboard/InstallationManagerModal';
import { useLicenseStatus } from '@/hooks/useLicenseStatus';

const Settings = () => {
  const { user } = useAuth();
  const { license, activate, refresh, remove } = useLicenseStatus();
  const [installModalOpen, setInstallModalOpen] = useState(false);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          Settings
          <Badge variant="secondary" className="text-xs">Beta</Badge>
        </h1>
        <p className="text-muted-foreground">Manage your account preferences</p>
      </div>

      <div className="space-y-6">
        {/* License Management Section */}
        <LicenseKeySection
          licenseInfo={license}
          onLicenseUpdate={async (key) => {
            const result = await activate(key);
            return { 
              success: result.success, 
              license: license || undefined,
              error: result.error 
            };
          }}
          onRefresh={refresh}
          onRemove={remove}
        />

        {/* EA/cBot Installation Section */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              EA & cBot Installation
            </CardTitle>
            <CardDescription>
              Install trading components on your terminals
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Install the Hedge Edge Expert Advisor (EA), DLL bridge, or cBot to enable automated 
              trade copying and hedge detection on your trading terminals.
            </p>
            <div className="flex items-center gap-4">
              <Button onClick={() => setInstallModalOpen(true)}>
                <Cpu className="h-4 w-4 mr-2" />
                Open Installation Manager
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription>Your personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input id="name" placeholder="Enter your name" />
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Configure how you receive updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Email Notifications</p>
                <p className="text-sm text-muted-foreground">Receive updates via email</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Trade Alerts</p>
                <p className="text-sm text-muted-foreground">Get notified when trades are copied</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Risk Alerts</p>
                <p className="text-sm text-muted-foreground">Alerts when approaching drawdown limits</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">License Expiry Reminder</p>
                <p className="text-sm text-muted-foreground">Get notified before license expires</p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the look and feel</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Dark Mode</p>
                <p className="text-sm text-muted-foreground">Use dark theme (default)</p>
              </div>
              <Switch defaultChecked disabled />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>Account security settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline">Change Password</Button>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
              </div>
              <Button variant="outline" size="sm">Enable</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Installation Manager Modal */}
      <InstallationManagerModal
        open={installModalOpen}
        onOpenChange={setInstallModalOpen}
      />
    </div>
  );
};

export default Settings;
