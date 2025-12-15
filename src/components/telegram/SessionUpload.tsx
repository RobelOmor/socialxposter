import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Loader2, CheckCircle2, XCircle, Phone, User, MessageSquare, Globe, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTelegramConfig } from "@/hooks/useTelegramConfig";
import { useTelegramProxies, TelegramProxy } from "@/hooks/useTelegramProxies";

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
  const { availableProxies, markProxyAsUsed, fetchProxies, loading: proxiesLoading } = useTelegramProxies();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  // Auto-selected proxy from available proxies
  const [selectedProxy, setSelectedProxy] = useState<TelegramProxy | null>(null);
  
  // Validation result
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [pendingSessionData, setPendingSessionData] = useState<{
    data: string;
    phone: string;
    fileName: string;
  } | null>(null);

  // Fetch proxies and auto-select the first available one
  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  useEffect(() => {
    if (availableProxies.length > 0 && !selectedProxy) {
      setSelectedProxy(availableProxies[0]);
    }
  }, [availableProxies, selectedProxy]);

  const getProxyData = () => {
    if (!selectedProxy) return null;
    return {
      host: selectedProxy.proxy_host,
      port: selectedProxy.proxy_port,
      username: selectedProxy.proxy_username,
      password: selectedProxy.proxy_password,
    };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!selectedProxy) {
      toast.error("Please add proxy first then add session");
      e.target.value = "";
      return;
    }

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
    if (!pendingSessionData || !selectedProxy) return;

    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please login first");
        setIsUploading(false);
        return;
      }

      const { data: insertedSession, error } = await supabase.from("telegram_sessions").upsert({
        user_id: user.id,
        phone_number: pendingSessionData.phone,
        session_name: pendingSessionData.fileName,
        session_data: pendingSessionData.data,
        status: sessionDetails?.valid ? "active" : "expired",
        telegram_name: sessionDetails?.name || null,
        proxy_host: selectedProxy.proxy_host,
        proxy_port: selectedProxy.proxy_port,
        proxy_username: selectedProxy.proxy_username,
        proxy_password: selectedProxy.proxy_password,
      }, {
        onConflict: "phone_number,user_id",
      }).select().single();

      if (error) throw error;

      // Mark system proxy as used
      if (insertedSession) {
        await markProxyAsUsed(selectedProxy.id, insertedSession.id);
      }

      toast.success("Session saved successfully");
      setSessionDetails(null);
      setPendingSessionData(null);
      setSelectedProxy(null);
      fetchProxies();
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

  const hasNoProxy = !proxiesLoading && availableProxies.length === 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Upload className="h-5 w-5" />
          Upload & Validate Session
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* No Proxy Warning */}
        {hasNoProxy && !sessionDetails && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm">Please add proxy first then add session</span>
          </div>
        )}

        {/* Auto-selected Proxy Display */}
        {selectedProxy && !sessionDetails && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">System Proxy (Auto)</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedProxy.proxy_host}:{selectedProxy.proxy_port}
                </p>
              </div>
            </div>
            <span className="text-xs text-green-400 bg-green-500/20 px-2 py-1 rounded">
              {availableProxies.length} available
            </span>
          </div>
        )}

        {/* File Upload */}
        {!sessionDetails && (
          <div className={`border-2 border-dashed rounded-lg p-6 text-center ${hasNoProxy ? 'border-muted opacity-50' : 'border-border'}`}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".session"
              onChange={handleFileSelect}
              className="hidden"
              id="session-upload"
              disabled={isUploading || isValidating || hasNoProxy}
            />
            <label
              htmlFor="session-upload"
              className={`flex flex-col items-center gap-2 ${hasNoProxy ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <span className="text-muted-foreground">Validating session...</span>
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {hasNoProxy ? "Add proxy first to upload session" : "Click to upload .session file"}
                  </span>
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
              {selectedProxy && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Proxy:</span>
                    <span className="font-mono">
                      {selectedProxy.proxy_host}:{selectedProxy.proxy_port}
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
