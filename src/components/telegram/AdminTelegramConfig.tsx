import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Server, Key, Settings, Loader2, Check, X, RefreshCw, Upload, MessageCircle, User, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TelegramConfig {
  id: string;
  vps_ip: string | null;
  instagram_vps_ip: string | null;
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
  const [uploading, setUploading] = useState(false);
  const [apiStatus, setApiStatus] = useState<"unknown" | "online" | "offline">("unknown");
  const [testResult, setTestResult] = useState<string>("");
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [vpsIp, setVpsIp] = useState("");
  const [instagramVpsIp, setInstagramVpsIp] = useState("");
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
      setInstagramVpsIp(configData.instagram_vps_ip || "");
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
          instagram_vps_ip: instagramVpsIp || null,
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

  const handleSessionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = btoa(
          new Uint8Array(event.target?.result as ArrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        // Extract phone from filename (e.g., +12093130115.session)
        const phoneMatch = file.name.match(/\+?(\d+)\.session/);
        const phoneNumber = phoneMatch ? phoneMatch[1] : file.name.replace('.session', '');

        // Test the session with VPS
        const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
          body: {
            endpoint: "/validate-session",
            method: "POST",
            body: {
              session_data: base64Data,
              phone_number: phoneNumber,
            }
          }
        });

        if (error) throw error;

        setTestResult(JSON.stringify(data, null, 2));
        
        if (data?.valid) {
          setSessionDetails({
            phone: data.phone || phoneNumber,
            first_name: data.first_name || data.user_name || 'Unknown',
            username: data.username,
            dialogs_count: data.dialogs_count || 0,
            unread_count: data.unread_count || 0,
            session_data: base64Data,
          });
          toast.success(`Session valid! User: ${data.first_name || data.user_name}`);
        } else {
          setSessionDetails(null);
          toast.error("Session invalid: " + (data?.error || "Unknown error"));
        }
        setUploading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      toast.error(error.message);
      setUploading(false);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const testSessionWithFullDetails = async () => {
    setTestingSession(true);
    setTestResult("");
    setSessionDetails(null);
    
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
      
      // Call validate-session with get_details flag
      const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
        body: {
          endpoint: "/validate-session",
          method: "POST",
          body: {
            session_data: session.session_data,
            phone_number: session.phone_number,
            get_details: true, // Request full details
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
        setSessionDetails({
          phone: data.phone || session.phone_number,
          first_name: data.first_name || data.user_name || 'Unknown',
          username: data.username,
          dialogs_count: data.dialogs_count || 0,
          unread_count: data.unread_count || 0,
        });
        toast.success(`Session valid! User: ${data.first_name || data.user_name || 'Unknown'}`);
      } else {
        setSessionDetails(null);
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Telegram VPS IP</Label>
              <Input
                placeholder="145.223.22.249"
                value={vpsIp}
                onChange={(e) => {
                  setVpsIp(e.target.value);
                  setApiStatus("unknown");
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">For Telegram sessions (port 8000)</p>
            </div>
            <div>
              <Label>Instagram VPS IP</Label>
              <Input
                placeholder="61b633fc5dec.ngrok-free.app"
                value={instagramVpsIp}
                onChange={(e) => setInstagramVpsIp(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">For Instagram accounts (port 8001 or ngrok)</p>
            </div>
          </div>
          
          <div className="flex gap-2">
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
              Test Telegram VPS
            </Button>
          </div>
          
          {apiStatus !== "unknown" && (
            <div className={`p-3 rounded-lg text-sm ${
              apiStatus === "online" 
                ? "bg-green-500/10 text-green-500 border border-green-500/20" 
                : "bg-red-500/10 text-red-500 border border-red-500/20"
            }`}>
              {apiStatus === "online" 
                ? `✓ Telegram VPS API is online` 
                : `✕ Cannot connect to Telegram VPS`}
            </div>
          )}

          <Separator className="my-4" />
          
          {/* Session Upload Test */}
          <div className="space-y-3">
            <div>
              <Label>Upload & Test Session File</Label>
              <p className="text-xs text-muted-foreground">Upload a .session file to validate and see full details</p>
            </div>
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".session"
                onChange={handleSessionUpload}
                className="hidden"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={uploading || apiStatus !== "online"} 
                variant="outline" 
                className="gap-2"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload .session File
              </Button>
              
              <Button 
                onClick={testSessionWithFullDetails} 
                disabled={testingSession || apiStatus !== "online"} 
                variant="secondary" 
                className="gap-2"
              >
                {testingSession ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Test Existing Session
              </Button>
            </div>
            
            {/* Session Details Card */}
            {sessionDetails && (
              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{sessionDetails.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Name</p>
                        <p className="font-medium">{sessionDetails.first_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Dialogs</p>
                        <p className="font-medium">{sessionDetails.dialogs_count}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Unread</p>
                        <p className="font-medium text-blue-500">{sessionDetails.unread_count}</p>
                      </div>
                    </div>
                  </div>
                  {sessionDetails.username && (
                    <p className="text-sm text-muted-foreground mt-2">@{sessionDetails.username}</p>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Raw Response */}
            {testResult && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer">Raw VPS Response</summary>
                <pre className="p-3 bg-muted rounded-lg text-xs overflow-auto max-h-48 mt-2">
                  {testResult}
                </pre>
              </details>
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
