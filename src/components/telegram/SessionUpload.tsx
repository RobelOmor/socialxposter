import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, XCircle, Phone, User, MessageSquare, Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramConfig } from "@/hooks/useTelegramConfig";
import { useTelegramProxies, TelegramProxy } from "@/hooks/useTelegramProxies";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface SessionUploadProps {
  onSessionAdded: () => void;
}

interface SessionDetails {
  phone: string;
  name: string | null;
  dialogs: number;
  unread: number;
  valid: boolean;
}

export const SessionUpload = ({ onSessionAdded }: SessionUploadProps) => {
  const { config } = useTelegramConfig();
  const { availableProxies, markProxyAsUsed, fetchProxies } = useTelegramProxies();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  
  // Proxy mode: "custom" or "system"
  const [useProxy, setUseProxy] = useState(false);
  const [proxyMode, setProxyMode] = useState<"custom" | "system">("custom");
  const [selectedProxyId, setSelectedProxyId] = useState<string>("");
  
  const [proxyConfig, setProxyConfig] = useState({
    host: "",
    port: "",
    username: "",
    password: "",
  });
  
  // Validation result
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [pendingSessionData, setPendingSessionData] = useState<{
    data: string;
    phone: string;
    fileName: string;
  } | null>(null);

  // Refresh proxies when component mounts or when useProxy changes
  useEffect(() => {
    if (useProxy && proxyMode === "system") {
      fetchProxies();
    }
  }, [useProxy, proxyMode, fetchProxies]);

  const getSelectedProxy = (): TelegramProxy | undefined => {
    return availableProxies.find(p => p.id === selectedProxyId);
  };

  const getProxyData = () => {
    if (!useProxy) return null;
    
    if (proxyMode === "system") {
      const proxy = getSelectedProxy();
      if (!proxy) return null;
      return {
        host: proxy.proxy_host,
        port: proxy.proxy_port,
        username: proxy.proxy_username,
        password: proxy.proxy_password,
      };
    } else {
      if (!proxyConfig.host) return null;
      return {
        host: proxyConfig.host,
        port: proxyConfig.port ? parseInt(proxyConfig.port) : null,
        username: proxyConfig.username || null,
        password: proxyConfig.password || null,
      };
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);
    setSessionDetails(null);
    setPendingSessionData(null);

    try {
      // Extract phone number from filename
      const fileName = file.name;
      const phoneMatch = fileName.match(/(\d+)/);
      const phoneNumber = phoneMatch ? phoneMatch[1] : fileName.replace(".session", "");

      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Store pending data
      setPendingSessionData({
        data: base64,
        phone: phoneNumber,
        fileName: fileName.replace(".session", ""),
      });

      // Validate with VPS
      setIsValidating(true);
      
      const proxyData = getProxyData();

      const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
        body: {
          endpoint: "/validate-session",
          method: "POST",
          body: {
            session_data: base64,
            api_id: config.apiId,
            api_hash: config.apiHash,
            proxy: proxyData,
            get_details: true,
          }
        }
      });

      if (error) throw error;

      console.log("VPS validate response:", data);

      setSessionDetails({
        phone: data.phone || phoneNumber,
        name: data.user_name || data.first_name || data.username || null,
        dialogs: data.dialogs_count || 0,
        unread: data.unread_count || 0,
        valid: data.valid === true,
      });

      if (data.valid) {
        toast.success(`Session valid: ${data.first_name || data.user_name || phoneNumber}`);
      } else {
        toast.error("Session is expired or invalid");
      }

    } catch (error: any) {
      console.error("Error validating session:", error);
      toast.error(error.message || "Failed to validate session");
      setSessionDetails({
        phone: pendingSessionData?.phone || "Unknown",
        name: null,
        dialogs: 0,
        unread: 0,
        valid: false,
      });
    }

    setIsValidating(false);
    setIsUploading(false);
    e.target.value = "";
  };

  const handleSaveSession = async () => {
    if (!pendingSessionData) return;

    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please login first");
        setIsUploading(false);
        return;
      }

      let proxyFields: any = {
        proxy_host: null,
        proxy_port: null,
        proxy_username: null,
        proxy_password: null,
      };

      if (useProxy) {
        if (proxyMode === "system") {
          const proxy = getSelectedProxy();
          if (proxy) {
            proxyFields = {
              proxy_host: proxy.proxy_host,
              proxy_port: proxy.proxy_port,
              proxy_username: proxy.proxy_username,
              proxy_password: proxy.proxy_password,
            };
          }
        } else {
          proxyFields = {
            proxy_host: proxyConfig.host || null,
            proxy_port: proxyConfig.port ? parseInt(proxyConfig.port) : null,
            proxy_username: proxyConfig.username || null,
            proxy_password: proxyConfig.password || null,
          };
        }
      }

      const { data: insertedSession, error } = await supabase.from("telegram_sessions").upsert({
        user_id: user.id,
        phone_number: pendingSessionData.phone,
        session_name: pendingSessionData.fileName,
        session_data: pendingSessionData.data,
        status: sessionDetails?.valid ? "active" : "expired",
        telegram_name: sessionDetails?.name || null,
        ...proxyFields,
      }, {
        onConflict: "phone_number,user_id",
      }).select().single();

      if (error) throw error;

      // Mark system proxy as used
      if (useProxy && proxyMode === "system" && selectedProxyId && insertedSession) {
        await markProxyAsUsed(selectedProxyId, insertedSession.id);
      }

      toast.success("Session saved successfully");
      setSessionDetails(null);
      setPendingSessionData(null);
      setSelectedProxyId("");
      onSessionAdded();
    } catch (error: any) {
      console.error("Error saving session:", error);
      toast.error(error.message || "Failed to save session");
    }

    setIsUploading(false);
  };

  const handleReset = () => {
    setSessionDetails(null);
    setPendingSessionData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Upload className="h-5 w-5" />
          Upload & Validate Session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proxy Toggle */}
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground">Use Proxy</Label>
          <Switch checked={useProxy} onCheckedChange={setUseProxy} />
        </div>

        {/* Proxy Mode Selection */}
        {useProxy && (
          <div className="space-y-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={proxyMode === "custom"} 
                  onCheckedChange={(checked) => setProxyMode(checked ? "custom" : "system")}
                />
                <Label className="text-sm">Custom Proxy</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={proxyMode === "system"} 
                  onCheckedChange={(checked) => setProxyMode(checked ? "system" : "custom")}
                />
                <Label className="text-sm flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  System Proxy
                </Label>
              </div>
            </div>

            {/* Custom Proxy Configuration */}
            {proxyMode === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Proxy Host</Label>
                  <Input
                    placeholder="proxy.example.com"
                    value={proxyConfig.host}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, host: e.target.value })}
                    className="bg-background h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Proxy Port</Label>
                  <Input
                    placeholder="1080"
                    type="number"
                    value={proxyConfig.port}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, port: e.target.value })}
                    className="bg-background h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Username (optional)</Label>
                  <Input
                    placeholder="username"
                    value={proxyConfig.username}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, username: e.target.value })}
                    className="bg-background h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Password (optional)</Label>
                  <Input
                    placeholder="password"
                    type="password"
                    value={proxyConfig.password}
                    onChange={(e) => setProxyConfig({ ...proxyConfig, password: e.target.value })}
                    className="bg-background h-9"
                  />
                </div>
              </div>
            )}

            {/* System Proxy Selection */}
            {proxyMode === "system" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Select Available Proxy</Label>
                  <Badge variant="outline" className="text-xs">
                    {availableProxies.length} available
                  </Badge>
                </div>
                
                {availableProxies.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                    No available proxies. Add proxies first.
                  </div>
                ) : (
                  <Select value={selectedProxyId} onValueChange={setSelectedProxyId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select a proxy..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProxies.map((proxy, index) => (
                        <SelectItem key={proxy.id} value={proxy.id}>
                          <span className="font-mono text-sm">
                            #{index + 1} - {proxy.proxy_host}:{proxy.proxy_port}
                            {proxy.proxy_username && ` (${proxy.proxy_username})`}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
        )}

        {/* File Upload */}
        {!sessionDetails && (
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".session"
              onChange={handleFileSelect}
              className="hidden"
              id="session-upload"
              disabled={isUploading || isValidating}
            />
            <label
              htmlFor="session-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <span className="text-muted-foreground">Validating session...</span>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-muted-foreground">Click to upload .session file</span>
                  <span className="text-xs text-muted-foreground">
                    Telethon/Pyrogram format
                  </span>
                </>
              )}
            </label>
          </div>
        )}

        {/* Session Details */}
        {sessionDetails && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${sessionDetails.valid ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center gap-2 mb-3">
                {sessionDetails.valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className={`font-medium ${sessionDetails.valid ? 'text-green-500' : 'text-red-500'}`}>
                  {sessionDetails.valid ? 'Session Valid' : 'Session Invalid/Expired'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Phone</div>
                    <div className="font-medium">{sessionDetails.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Name</div>
                    <div className="font-medium">{sessionDetails.name || '-'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Dialogs</div>
                    <div className="font-medium">{sessionDetails.dialogs}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Unread</div>
                    <div className="font-medium text-primary">{sessionDetails.unread}</div>
                  </div>
                </div>
              </div>

              {/* Show selected proxy info */}
              {useProxy && proxyMode === "system" && selectedProxyId && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Proxy:</span>
                    <span className="font-mono">
                      {getSelectedProxy()?.proxy_host}:{getSelectedProxy()?.proxy_port}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleSaveSession} 
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {sessionDetails.valid ? 'Save Session' : 'Save Anyway'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
