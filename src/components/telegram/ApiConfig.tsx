import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Server, Check, X, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ApiConfigProps {
  apiUrl: string;
  onApiUrlChange: (url: string) => void;
}

export const ApiConfig = ({ apiUrl, onApiUrlChange }: ApiConfigProps) => {
  const { toast } = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [apiStatus, setApiStatus] = useState<"unknown" | "online" | "offline">("unknown");

  const handleCheckConnection = async () => {
    if (!apiUrl) {
      toast({ title: "Error", description: "Enter API URL first", variant: "destructive" });
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: "GET",
        mode: "cors",
      });

      if (response.ok) {
        setApiStatus("online");
        toast({ title: "Success", description: "Python API is online" });
      } else {
        setApiStatus("offline");
        toast({ title: "Error", description: "API returned error", variant: "destructive" });
      }
    } catch (error) {
      console.error("API check failed:", error);
      setApiStatus("offline");
      toast({ title: "Error", description: "Cannot connect to API", variant: "destructive" });
    }
    setIsChecking(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Copied to clipboard" });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Server className="h-5 w-5" />
          Python API Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
          <h4 className="font-medium text-foreground">📋 VPS Setup Guide</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><strong>1. Buy VPS:</strong> DigitalOcean, Vultr, or Hetzner ($5-10/mo)</p>
            <p><strong>2. OS:</strong> Ubuntu 22.04 LTS</p>
            <p><strong>3. RAM:</strong> Minimum 1GB (2GB recommended for many sessions)</p>
            <p><strong>4. Deploy:</strong> Clone repo and run docker-compose up -d</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard("https://github.com/your-repo/telegram-api-server")}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy Repo URL
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://docs.digitalocean.com/products/droplets/quickstart/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                VPS Guide
              </a>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Python API URL</Label>
          <div className="flex gap-2">
            <Input
              placeholder="http://your-vps-ip:8000"
              value={apiUrl}
              onChange={(e) => onApiUrlChange(e.target.value)}
              className="bg-background"
            />
            <Button onClick={handleCheckConnection} disabled={isChecking}>
              {isChecking ? "Checking..." : "Check"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge
              className={
                apiStatus === "online"
                  ? "bg-green-500/20 text-green-400 border-green-500/30"
                  : apiStatus === "offline"
                  ? "bg-red-500/20 text-red-400 border-red-500/30"
                  : "bg-gray-500/20 text-gray-400 border-gray-500/30"
              }
            >
              {apiStatus === "online" && <Check className="h-3 w-3 mr-1" />}
              {apiStatus === "offline" && <X className="h-3 w-3 mr-1" />}
              {apiStatus === "unknown" ? "Not checked" : apiStatus}
            </Badge>
          </div>
        </div>

        <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
          <h4 className="font-medium text-foreground mb-2">🔑 What info to provide after VPS setup:</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>API URL:</strong> http://YOUR_VPS_IP:8000</li>
            <li><strong>Proxy format:</strong> host:port:username:password (per session)</li>
            <li><strong>Session files:</strong> .session files from Telethon/Pyrogram</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
