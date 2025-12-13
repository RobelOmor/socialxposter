import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Phone, Shield, Loader2, CheckCircle2, User, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PhoneVerificationProps {
  apiId: string;
  apiHash: string;
  onSessionAdded: () => void;
}

interface SessionData {
  session_data: string;
  user_name: string | null;
  first_name: string | null;
  phone: string | null;
}

export const PhoneVerification = ({ apiId, apiHash, onSessionAdded }: PhoneVerificationProps) => {
  const [step, setStep] = useState<"phone" | "code" | "password" | "confirm" | "success">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  
  // Proxy toggle and config
  const [useProxy, setUseProxy] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");

  const callVpsProxy = async (endpoint: string, body: any) => {
    const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
      body: {
        endpoint,
        method: "POST",
        body
      }
    });
    
    if (error) throw error;
    return data;
  };

  const getProxyConfig = () => {
    if (!useProxy || !proxyHost) return null;
    return {
      host: proxyHost,
      port: parseInt(proxyPort) || 1080,
      username: proxyUsername || null,
      password: proxyPassword || null,
    };
  };

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      toast.error("Enter phone number");
      return;
    }

    setIsLoading(true);
    try {
      const data = await callVpsProxy("/send-code", {
        phone_number: phoneNumber,
        api_id: apiId,
        api_hash: apiHash,
        proxy: getProxyConfig(),
      });

      if (data.status === "ok" || data.success) {
        setPhoneCodeHash(data.phone_code_hash || "");
        setStep("code");
        toast.success("Verification code sent!");
      } else {
        toast.error(data.error || data.message || "Failed to send code");
      }
    } catch (error: any) {
      toast.error(error.message || "Cannot connect to VPS API");
    }
    setIsLoading(false);
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast.error("Enter verification code");
      return;
    }

    setIsLoading(true);
    try {
      const data = await callVpsProxy("/verify-code", {
        phone_number: phoneNumber,
        code: verificationCode,
        api_id: apiId,
        api_hash: apiHash,
        proxy: getProxyConfig(),
      });

      if (data.success) {
        // Show confirmation step with user info
        setSessionData({
          session_data: data.session_data,
          user_name: data.user_name || null,
          first_name: data.first_name || null,
          phone: data.phone || phoneNumber,
        });
        setStep("confirm");
        toast.success("Verified! Please confirm to save session.");
      } else if (data.requires_password) {
        setStep("password");
        toast.info("2FA password required");
      } else {
        toast.error(data.error || "Verification failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    }
    setIsLoading(false);
  };

  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      toast.error("Enter 2FA password");
      return;
    }

    setIsLoading(true);
    try {
      const data = await callVpsProxy("/verify-password", {
        phone_number: phoneNumber,
        password: password,
        api_id: apiId,
        api_hash: apiHash,
        proxy: getProxyConfig(),
      });

      if (data.success) {
        // Show confirmation step with user info
        setSessionData({
          session_data: data.session_data,
          user_name: data.user_name || null,
          first_name: data.first_name || null,
          phone: data.phone || phoneNumber,
        });
        setStep("confirm");
        toast.success("Verified! Please confirm to save session.");
      } else {
        toast.error(data.error || "Password verification failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Password verification failed");
    }
    setIsLoading(false);
  };

  const handleSaveSession = async () => {
    if (!sessionData) return;

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please login first");
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.from("telegram_sessions").upsert({
        user_id: user.id,
        phone_number: phoneNumber,
        session_name: phoneNumber,
        session_data: sessionData.session_data,
        telegram_name: sessionData.user_name || sessionData.first_name || null,
        status: "active",
        proxy_host: useProxy && proxyHost ? proxyHost : null,
        proxy_port: useProxy && proxyPort ? parseInt(proxyPort) : null,
        proxy_username: useProxy && proxyUsername ? proxyUsername : null,
        proxy_password: useProxy && proxyPassword ? proxyPassword : null,
      }, {
        onConflict: "phone_number,user_id",
      });

      if (error) {
        toast.error("Failed to save session");
      } else {
        setStep("success");
        toast.success("Session saved successfully!");
        onSessionAdded();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save session");
    }
    setIsLoading(false);
  };

  const resetForm = () => {
    setStep("phone");
    setPhoneNumber("");
    setVerificationCode("");
    setPassword("");
    setPhoneCodeHash("");
    setSessionData(null);
    setUseProxy(false);
    setProxyHost("");
    setProxyPort("");
    setProxyUsername("");
    setProxyPassword("");
  };

  if (step === "success") {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Session Created!</h3>
            <p className="text-sm text-muted-foreground">Phone: {phoneNumber}</p>
            {sessionData?.user_name && (
              <p className="text-sm text-muted-foreground">Name: {sessionData.user_name}</p>
            )}
          </div>
          <Button onClick={resetForm} variant="outline">Add Another Session</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Phone className="h-5 w-5" />
          Phone Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proxy Toggle */}
        {step === "phone" && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium text-foreground">Use Proxy</Label>
              <p className="text-xs text-muted-foreground">Connect via SOCKS5 proxy</p>
            </div>
            <Switch
              checked={useProxy}
              onCheckedChange={setUseProxy}
            />
          </div>
        )}

        {/* Proxy Configuration - only show when toggle is on */}
        {useProxy && step === "phone" && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <Label className="text-muted-foreground text-sm">Proxy Host</Label>
              <Input
                placeholder="proxy.example.com"
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                className="bg-background"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Proxy Port</Label>
              <Input
                placeholder="1080"
                type="number"
                value={proxyPort}
                onChange={(e) => setProxyPort(e.target.value)}
                className="bg-background"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Proxy Username</Label>
              <Input
                placeholder="username"
                value={proxyUsername}
                onChange={(e) => setProxyUsername(e.target.value)}
                className="bg-background"
              />
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Proxy Password</Label>
              <Input
                placeholder="password"
                type="password"
                value={proxyPassword}
                onChange={(e) => setProxyPassword(e.target.value)}
                className="bg-background"
              />
            </div>
          </div>
        )}

        {/* Phone Input Step */}
        {step === "phone" && (
          <div className="space-y-3">
            <div>
              <Label className="text-muted-foreground">Phone Number (with country code)</Label>
              <Input
                placeholder="+8801XXXXXXXXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="bg-background"
              />
            </div>
            <Button onClick={handleSendCode} disabled={isLoading} className="w-full gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              Send Verification Code
            </Button>
          </div>
        )}

        {/* Code Input Step */}
        {step === "code" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Code sent to <span className="font-medium text-foreground">{phoneNumber}</span>
            </p>
            <div>
              <Label className="text-muted-foreground">Verification Code</Label>
              <Input
                placeholder="12345"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setStep("phone")} variant="outline" className="flex-1">
                Back
              </Button>
              <Button onClick={handleVerifyCode} disabled={isLoading} className="flex-1 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Verify Code
              </Button>
            </div>
          </div>
        )}

        {/* 2FA Password Step */}
        {step === "password" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Two-factor authentication is enabled. Enter your 2FA password.
            </p>
            <div>
              <Label className="text-muted-foreground">2FA Password</Label>
              <Input
                type="password"
                placeholder="Your 2FA password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setStep("code")} variant="outline" className="flex-1">
                Back
              </Button>
              <Button onClick={handleVerifyPassword} disabled={isLoading} className="flex-1 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                Verify Password
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Step */}
        {step === "confirm" && sessionData && (
          <div className="space-y-4">
            <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
              <User className="h-12 w-12 mx-auto text-primary mb-3" />
              <h3 className="text-lg font-semibold text-foreground">
                {sessionData.user_name || sessionData.first_name || "Unknown User"}
              </h3>
              <p className="text-sm text-muted-foreground">{phoneNumber}</p>
              {useProxy && proxyHost && (
                <p className="text-xs text-muted-foreground mt-2">
                  Proxy: {proxyHost}:{proxyPort || "1080"}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={resetForm} variant="outline" className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSaveSession} disabled={isLoading} className="flex-1 gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Session
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
