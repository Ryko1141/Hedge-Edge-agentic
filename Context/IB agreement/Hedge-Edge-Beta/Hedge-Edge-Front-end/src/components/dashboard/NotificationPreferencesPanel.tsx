/**
 * Notification Preferences Panel
 * 
 * Allows users to configure email notification settings for the trade copier.
 * Settings are stored in Supabase `notification_preferences` table.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail, Shield, AlertTriangle, BarChart3, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationPreferences {
  email_enabled: boolean;
  email_address: string;
  notify_on_copy_success: boolean;
  notify_on_copy_failure: boolean;
  notify_on_protection_triggered: boolean;
  notify_on_circuit_breaker: boolean;
  notify_on_daily_summary: boolean;
  min_interval_seconds: number;
  daily_summary_hour: number;
}

const DEFAULT_PREFS: NotificationPreferences = {
  email_enabled: true,
  email_address: '',
  notify_on_copy_success: false,
  notify_on_copy_failure: true,
  notify_on_protection_triggered: true,
  notify_on_circuit_breaker: true,
  notify_on_daily_summary: true,
  min_interval_seconds: 60,
  daily_summary_hour: 17,
};

export function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  // Load preferences from Supabase
  useEffect(() => {
    async function loadPrefs() {
      try {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // notification_preferences table not yet in generated Supabase types (migration pending)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (data && !error) {
          const row = data as Record<string, unknown>;
          setPrefs({
            email_enabled: (row.email_enabled as boolean) ?? true,
            email_address: (row.email_address as string) ?? '',
            notify_on_copy_success: (row.notify_on_copy_success as boolean) ?? false,
            notify_on_copy_failure: (row.notify_on_copy_failure as boolean) ?? true,
            notify_on_protection_triggered: (row.notify_on_protection_triggered as boolean) ?? true,
            notify_on_circuit_breaker: (row.notify_on_circuit_breaker as boolean) ?? true,
            notify_on_daily_summary: (row.notify_on_daily_summary as boolean) ?? true,
            min_interval_seconds: (row.min_interval_seconds as number) ?? 60,
            daily_summary_hour: (row.daily_summary_hour as number) ?? 17,
          });
        }
        // If no row exists, defaults are fine (will upsert on save)
      } catch (err) {
        console.error('Failed to load notification preferences:', err);
      } finally {
        setLoading(false);
      }
    }
    loadPrefs();
  }, []);

  const updatePref = useCallback(<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (!supabase) throw new Error('Supabase not available');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // notification_preferences table not yet in generated Supabase types (migration pending)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          ...prefs,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setDirty(false);
      toast({ title: 'Saved', description: 'Notification preferences updated' });
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
      toast({ title: 'Error', description: 'Failed to save preferences', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [prefs, toast]);

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-primary" />
          Email Notifications
          {dirty && <Badge variant="secondary" className="text-[10px]">Unsaved</Badge>}
        </CardTitle>
        <CardDescription>
          Get notified about important copier events via email
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="email-enabled">Enable email notifications</Label>
          </div>
          <Switch
            id="email-enabled"
            checked={prefs.email_enabled}
            onCheckedChange={(v) => updatePref('email_enabled', v)}
          />
        </div>

        {prefs.email_enabled && (
          <>
            {/* Email address override */}
            <div className="space-y-2">
              <Label htmlFor="email-address" className="text-sm text-muted-foreground">
                Email address (leave blank to use account email)
              </Label>
              <Input
                id="email-address"
                type="email"
                placeholder="Override email address..."
                value={prefs.email_address}
                onChange={(e) => updatePref('email_address', e.target.value)}
              />
            </div>

            {/* Event toggles */}
            <div className="space-y-3 border-t border-border/30 pt-4">
              <p className="text-sm font-medium text-foreground">Notify me when:</p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                  <Label htmlFor="notify-failure" className="text-sm">Trade copy fails</Label>
                </div>
                <Switch
                  id="notify-failure"
                  checked={prefs.notify_on_copy_failure}
                  onCheckedChange={(v) => updatePref('notify_on_copy_failure', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />
                  <Label htmlFor="notify-circuit" className="text-sm">Circuit breaker trips</Label>
                </div>
                <Switch
                  id="notify-circuit"
                  checked={prefs.notify_on_circuit_breaker}
                  onCheckedChange={(v) => updatePref('notify_on_circuit_breaker', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
                  <Label htmlFor="notify-summary" className="text-sm">Daily summary report</Label>
                </div>
                <Switch
                  id="notify-summary"
                  checked={prefs.notify_on_daily_summary}
                  onCheckedChange={(v) => updatePref('notify_on_daily_summary', v)}
                />
              </div>
            </div>


          </>
        )}

        {/* Save */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            size="sm"
          >
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Save Preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
