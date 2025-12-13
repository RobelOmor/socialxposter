import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SessionUploadProps {
  onSessionAdded: () => void;
}

export const SessionUpload = ({ onSessionAdded }: SessionUploadProps) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [proxyConfig, setProxyConfig] = useState({
    host: "",
    port: "",
    username: "",
    password: "",
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadedCount(0);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Error", description: "Please login first", variant: "destructive" });
      setIsUploading(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      try {
        // Extract phone number from filename (e.g., 6283840857455.session)
        const fileName = file.name;
        const phoneMatch = fileName.match(/(\d+)/);
        const phoneNumber = phoneMatch ? phoneMatch[1] : fileName.replace(".session", "");

        // Read file as base64
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        // Insert or update session
        const { error } = await supabase.from("telegram_sessions").upsert({
          user_id: user.id,
          phone_number: phoneNumber,
          session_name: fileName.replace(".session", ""),
          session_data: base64,
          status: "active",
          proxy_host: proxyConfig.host || null,
          proxy_port: proxyConfig.port ? parseInt(proxyConfig.port) : null,
          proxy_username: proxyConfig.username || null,
          proxy_password: proxyConfig.password || null,
        }, {
          onConflict: "phone_number,user_id",
        });

        if (error) {
          console.error("Error uploading session:", error);
          failCount++;
        } else {
          successCount++;
          setUploadedCount(prev => prev + 1);
        }
      } catch (error) {
        console.error("Error processing file:", error);
        failCount++;
      }
    }

    toast({
      title: "Upload Complete",
      description: `${successCount} session(s) added, ${failCount} failed`,
      variant: successCount > 0 ? "default" : "destructive",
    });

    setIsUploading(false);
    onSessionAdded();
    e.target.value = "";
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Upload className="h-5 w-5" />
          Session Upload
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Proxy Configuration */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-muted-foreground">Proxy Host</Label>
            <Input
              placeholder="proxy.example.com"
              value={proxyConfig.host}
              onChange={(e) => setProxyConfig({ ...proxyConfig, host: e.target.value })}
              className="bg-background"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Proxy Port</Label>
            <Input
              placeholder="1080"
              type="number"
              value={proxyConfig.port}
              onChange={(e) => setProxyConfig({ ...proxyConfig, port: e.target.value })}
              className="bg-background"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Proxy Username</Label>
            <Input
              placeholder="username"
              value={proxyConfig.username}
              onChange={(e) => setProxyConfig({ ...proxyConfig, username: e.target.value })}
              className="bg-background"
            />
          </div>
          <div>
            <Label className="text-muted-foreground">Proxy Password</Label>
            <Input
              placeholder="password"
              type="password"
              value={proxyConfig.password}
              onChange={(e) => setProxyConfig({ ...proxyConfig, password: e.target.value })}
              className="bg-background"
            />
          </div>
        </div>

        {/* File Upload */}
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <input
            type="file"
            accept=".session"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id="session-upload"
            disabled={isUploading}
          />
          <label
            htmlFor="session-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Plus className="h-10 w-10 text-muted-foreground" />
            <span className="text-muted-foreground">
              {isUploading ? `Uploading... (${uploadedCount})` : "Click to upload .session files"}
            </span>
            <span className="text-xs text-muted-foreground">
              Supports multiple files (Telethon/Pyrogram format)
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
};
