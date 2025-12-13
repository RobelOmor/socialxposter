import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Shield, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PhoneVerificationProps {
  apiId: string;
  apiHash: string;
  onSessionAdded: () => void;
}

export const PhoneVerification = ({ apiId, apiHash, onSessionAdded }: PhoneVerificationProps) => {
  const [step, setStep] = useState<"phone" | "code" | "password" | "success">("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [phoneCodeHash, setPhoneCodeHash] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Proxy config
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
        proxy: proxyHost ? {
          host: proxyHost,
          port: parseInt(proxyPort) || 1080,
          username: proxyUsername || null,
          password: proxyPassword || null,
        } : null,
      });

      if (data.success) {
        setPhoneCodeHash(data.phone_code_hash);
        setStep("code");
        toast.success("Verification code sent!");
      } else {
        toast.error(data.error || "Failed to send code");
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
        phone_code: verificationCode,
        phone_code_hash: phoneCodeHash,
        api_id: apiId,
        api_hash: apiHash,
        proxy: proxyHost ? {
          host: proxyHost,
          port: parseInt(proxyPort) || 1080,
          username: proxyUsername || null,
          password: proxyPassword || null,
        } : null,
      });

      if (data.success) {
        // Save session to database
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
          session_data: data.session_data,
          telegram_name: data.user_name || data.first_name || null,
          status: "active",
          proxy_host: proxyHost || null,
          proxy_port: proxyPort ? parseInt(proxyPort) : null,
          proxy_username: proxyUsername || null,
          proxy_password: proxyPassword || null,
        }, {
          onConflict: "phone_number,user_id",
        });

        if (error) {
          toast.error("Failed to save session");
        } else {
          setStep("success");
          toast.success("Session created successfully!");
          onSessionAdded();
        }
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
        proxy: proxyHost ? {
          host: proxyHost,
          port: parseInt(proxyPort) || 1080,
          username: proxyUsername || null,
          password: proxyPassword || null,
        } : null,
      });

      if (data.success) {
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
          session_data: data.session_data,
          telegram_name: data.user_name || data.first_name || null,
          status: "active",
          proxy_host: proxyHost || null,
          proxy_port: proxyPort ? parseInt(proxyPort) : null,
          proxy_username: proxyUsername || null,
          proxy_password: proxyPassword || null,
        }, {
          onConflict: "phone_number,user_id",
        });

        if (error) {
          toast.error("Failed to save session");
        } else {
          setStep("success");
          toast.success("Session created successfully!");
          onSessionAdded();
        }
      } else {
        toast.error(data.error || "Password verification failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Password verification failed");
    }
    setIsLoading(false);
  };

  const resetForm = () => {
    setStep("phone");
    setPhoneNumber("");
    setVerificationCode("");
    setPassword("");
    setPhoneCodeHash("");
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
        {/* Proxy Configuration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-muted-foreground">Proxy Host (Optional)</Label>
            <Input
              placeholder="proxy.example.com"
              value={proxyHost}
              onChange={(e) => setProxyHost(e.target.value)}
              disabled={step !== "phone"}
              className="bg-background"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Proxy Port</Label>
            <Input
              placeholder="1080"
              type="number"
              value={proxyPort}
              onChange={(e) => setProxyPort(e.target.value)}
              disabled={step !== "phone"}
              className="bg-background"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Proxy Username</Label>
            <Input
              placeholder="username"
              value={proxyUsername}
              onChange={(e) => setProxyUsername(e.target.value)}
              disabled={step !== "phone"}
              className="bg-background"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Proxy Password</Label>
            <Input
              placeholder="password"
              type="password"
              value={proxyPassword}
              onChange={(e) => setProxyPassword(e.target.value)}
              disabled={step !== "phone"}
              className="bg-background"
            />
          </div>
        </div>

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
      </CardContent>
    </Card>
  );
};
