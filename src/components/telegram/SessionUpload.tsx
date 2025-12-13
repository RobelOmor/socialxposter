import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle2, XCircle, Phone, User, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramConfig } from "@/hooks/useTelegramConfig";
import { Switch } from "@/components/ui/switch";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [useProxy, setUseProxy] = useState(false);
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
      
      const proxyData = useProxy && proxyConfig.host ? {
        host: proxyConfig.host,
        port: proxyConfig.port ? parseInt(proxyConfig.port) : null,
        username: proxyConfig.username || null,
        password: proxyConfig.password || null,
      } : null;

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

      const proxyData = useProxy && proxyConfig.host ? {
        proxy_host: proxyConfig.host,
        proxy_port: proxyConfig.port ? parseInt(proxyConfig.port) : null,
        proxy_username: proxyConfig.username || null,
        proxy_password: proxyConfig.password || null,
      } : {
        proxy_host: null,
        proxy_port: null,
        proxy_username: null,
        proxy_password: null,
      };

      const { error } = await supabase.from("telegram_sessions").upsert({
        user_id: user.id,
        phone_number: pendingSessionData.phone,
        session_name: pendingSessionData.fileName,
        session_data: pendingSessionData.data,
        status: sessionDetails?.valid ? "active" : "expired",
        telegram_name: sessionDetails?.name || null,
        ...proxyData,
      }, {
        onConflict: "phone_number,user_id",
      });

      if (error) throw error;

      toast.success("Session saved successfully");
      setSessionDetails(null);
      setPendingSessionData(null);
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

        {/* Proxy Configuration */}
        {useProxy && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg">
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
