import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Server, Key, Settings, Loader2, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TelegramConfig {
  id: string;
  vps_ip: string | null;
  api_id: string | null;
  api_hash: string | null;
  max_sessions_per_user: number | null;
  max_messages_per_day: number | null;
  is_active: boolean | null;
}

export const AdminTelegramConfig = () => {
  const [config, setConfig] = useState<TelegramConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingSession, setTestingSession] = useState(false);
  const [apiStatus, setApiStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [testResult, setTestResult] = useState<string>("");

  // Form state
  const [vpsIp, setVpsIp] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [maxSessions, setMaxSessions] = useState("100");
  const [maxMessages, setMaxMessages] = useState("1000");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_admin_config")
      .select("*")
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      toast.error("Failed to fetch config");
    } else if (data) {
      const configData = data as TelegramConfig;
      setConfig(configData);
      setVpsIp(configData.vps_ip || "");
      setApiId(configData.api_id || "2040");
      setApiHash(configData.api_hash || "b18441a1ff607e10a989891a5462e627");
      setMaxSessions(configData.max_sessions_per_user?.toString() || "100");
      setMaxMessages(configData.max_messages_per_day?.toString() || "1000");
      setIsActive(configData.is_active ?? true);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("telegram_admin_config")
        .update({
          vps_ip: vpsIp || null,
          api_id: apiId || "2040",
          api_hash: apiHash || "b18441a1ff607e10a989891a5462e627",
          max_sessions_per_user: parseInt(maxSessions) || 100,
          max_messages_per_day: parseInt(maxMessages) || 1000,
          is_active: isActive,
        })
        .eq("id", config.id);

      if (error) throw error;
      toast.success("Configuration saved!");
      fetchConfig();
    } catch (error: any) {
      toast.error(error.message || "Failed to save config");
    }
    setSaving(false);
  };

  const testConnection = async () => {
    if (!vpsIp) {
      toast.error("Enter VPS IP first");
      return;
    }

    // First save the VPS IP
    if (config) {
      await supabase
        .from("telegram_admin_config")
        .update({ vps_ip: vpsIp })
        .eq("id", config.id);
    }

    setTesting(true);
    try {
      // Use Edge Function proxy instead of direct HTTP call
      const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
        body: {
          endpoint: "/health",
          method: "GET"
        }
      });

      if (error) throw error;

      if (data?.status === "ok") {
        setApiStatus("online");
        toast.success("VPS API is online!");
      } else {
        setApiStatus("offline");
        toast.error("API returned error");
      }
    } catch (error: any) {
      setApiStatus("offline");
      toast.error(error.message || "Cannot connect to VPS API");
    }
    setTesting(false);
  };

  const testSessionValidation = async () => {
    setTestingSession(true);
    setTestResult("");
    
    try {
      // Get a test session from DB
      const { data: sessions } = await supabase
        .from("telegram_sessions")
        .select("*")
        .limit(1);
      
      if (!sessions || sessions.length === 0) {
        setTestResult("No sessions found to test");
        setTestingSession(false);
        return;
      }

      const session = sessions[0];
      console.log("Testing session:", session.phone_number);
      
      const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
        body: {
          endpoint: "/validate-session",
          method: "POST",
          body: {
            session_data: session.session_data,
            phone_number: session.phone_number,
            proxy: session.proxy_host ? {
              host: session.proxy_host,
              port: session.proxy_port,
              username: session.proxy_username,
              password: session.proxy_password,
            } : null
          }
        }
      });

      console.log("VPS Response:", data);
      setTestResult(JSON.stringify(data, null, 2));
      
      if (error) {
        toast.error("Proxy error: " + error.message);
      } else if (data?.valid) {
        toast.success(`Session valid! User: ${data.user_name || data.first_name || 'Unknown'}`);
      } else {
        toast.warning("Session invalid: " + (data?.error || "Unknown error"));
      }
    } catch (error: any) {
      setTestResult(`Error: ${error.message}`);
      toast.error(error.message);
    }
    setTestingSession(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* VPS Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            VPS Server Configuration
          </CardTitle>
          <CardDescription>Configure the Python API server running on your VPS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label>VPS IP Address</Label>
              <Input
                placeholder="145.223.22.249"
                value={vpsIp}
                onChange={(e) => {
                  setVpsIp(e.target.value);
                  setApiStatus("unknown");
                }}
              />
            </div>
            <Button onClick={testConnection} disabled={testing} variant="outline" className="gap-2">
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : apiStatus === "online" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : apiStatus === "offline" ? (
                <X className="h-4 w-4 text-red-500" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Test Connection
            </Button>
          </div>
          
          {apiStatus !== "unknown" && (
            <div className={`p-3 rounded-lg text-sm ${
              apiStatus === "online" 
                ? "bg-green-500/10 text-green-500 border border-green-500/20" 
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}>
              {apiStatus === "online" 
                ? `✓ VPS API is online at http://${vpsIp}:8000` 
                : `✕ Cannot connect to http://${vpsIp}:8000`}
            </div>
          )}

          <Separator className="my-4" />
          
          {/* Session Test */}
          <div className="space-y-2">
            <Label>Test Session Validation</Label>
            <p className="text-xs text-muted-foreground">Test with a real session to debug validate-session endpoint</p>
            <Button 
              onClick={testSessionValidation} 
              disabled={testingSession || apiStatus !== "online"} 
              variant="secondary" 
              className="gap-2"
            >
              {testingSession ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Test Session Validation
            </Button>
            
            {testResult && (
              <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-48 mt-2">
                {testResult}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Telegram API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Telegram API Credentials
          </CardTitle>
          <CardDescription>API credentials for Telegram MTProto connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>API ID</Label>
              <Input
                placeholder="2040"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
              />
            </div>
            <div>
              <Label>API Hash</Label>
              <Input
                placeholder="b18441a1ff607e10a989891a5462e627"
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your own API credentials from{" "}
            <a href="https://my.telegram.org" target="_blank" rel="noopener" className="text-primary underline">
              my.telegram.org
            </a>
          </p>
        </CardContent>
      </Card>

      {/* User Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            User Limits & Controls
          </CardTitle>
          <CardDescription>Set limits for user Telegram features</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Sessions Per User</Label>
              <Input
                type="number"
                placeholder="100"
                value={maxSessions}
                onChange={(e) => setMaxSessions(e.target.value)}
              />
            </div>
            <div>
              <Label>Max Messages Per Day</Label>
              <Input
                type="number"
                placeholder="1000"
                value={maxMessages}
                onChange={(e) => setMaxMessages(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label>Telegram Features Active</Label>
              <p className="text-sm text-muted-foreground">Enable/disable Telegram features for all users</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
};
