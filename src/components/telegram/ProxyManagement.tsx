import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTelegramConfig } from "@/hooks/useTelegramConfig";
import { Plus, Loader2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

interface TelegramProxy {
  id: string;
  proxy_host: string;
  proxy_port: number;
  proxy_username: string | null;
  proxy_password: string | null;
  status: string;
  used_by_session_id: string | null;
  created_at: string;
}

interface ProxyManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProxyAdded?: () => void;
}

export const ProxyManagement = ({ open, onOpenChange, onProxyAdded }: ProxyManagementProps) => {
  const { user } = useAuth();
  const { config } = useTelegramConfig();
  const [proxies, setProxies] = useState<TelegramProxy[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Single proxy input
  const [singleProxy, setSingleProxy] = useState({
    host: "",
    port: "",
    username: "",
    password: "",
  });

  // Bulk proxy input
  const [bulkProxies, setBulkProxies] = useState("");

  useEffect(() => {
    if (open && user) {
      fetchProxies();
    }
  }, [open, user]);

  const fetchProxies = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_proxies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch proxies");
    } else {
      setProxies((data || []) as TelegramProxy[]);
    }
    setLoading(false);
  };

  const handleAddSingleProxy = async () => {
    if (!user) return;
    if (!singleProxy.host.trim() || !singleProxy.port.trim()) {
      toast.error("Host and port are required");
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase.from("telegram_proxies").insert({
        user_id: user.id,
        proxy_host: singleProxy.host.trim(),
        proxy_port: parseInt(singleProxy.port),
        proxy_username: singleProxy.username.trim() || null,
        proxy_password: singleProxy.password.trim() || null,
        status: "available",
      });

      if (error) throw error;

      toast.success("Proxy added successfully");
      setSingleProxy({ host: "", port: "", username: "", password: "" });
      fetchProxies();
      onProxyAdded?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add proxy");
    }
    setAdding(false);
  };

  const handleAddBulkProxies = async () => {
    if (!user) return;
    if (!bulkProxies.trim()) {
      toast.error("Enter proxy list");
      return;
    }

    setAdding(true);
    try {
      // Parse format: host:port:username:password or host:port
      const lines = bulkProxies.split("\n").map(l => l.trim()).filter(l => l);
      const proxyData = lines.map(line => {
        const parts = line.split(":");
        if (parts.length < 2) return null;
        return {
          user_id: user.id,
          proxy_host: parts[0].trim(),
          proxy_port: parseInt(parts[1]),
          proxy_username: parts[2]?.trim() || null,
          proxy_password: parts[3]?.trim() || null,
          status: "available",
        };
      }).filter(p => p !== null);

      if (proxyData.length === 0) {
        toast.error("No valid proxies found. Format: host:port or host:port:username:password");
        setAdding(false);
        return;
      }

      const { error } = await supabase.from("telegram_proxies").insert(proxyData);

      if (error) throw error;

      toast.success(`${proxyData.length} proxies added successfully`);
      setBulkProxies("");
      fetchProxies();
      onProxyAdded?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add proxies");
    }
    setAdding(false);
  };

  const handleTestProxy = async (proxy: TelegramProxy) => {
    setTestingId(proxy.id);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
        body: {
          endpoint: "/health",
          method: "POST",
          body: {
            test_proxy: true,
            proxy: {
              host: proxy.proxy_host,
              port: proxy.proxy_port,
              username: proxy.proxy_username,
              password: proxy.proxy_password,
            },
          }
        }
      });

      if (error) throw error;
      if (data.status === "ok") {
        toast.success("Proxy connection successful");
      } else {
        toast.error("Proxy test failed");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to test proxy");
    }
    setTestingId(null);
  };

  const handleDeleteProxy = async (proxyId: string) => {
    if (!confirm("Delete this proxy?")) return;
    
    try {
      const { error } = await supabase
        .from("telegram_proxies")
        .delete()
        .eq("id", proxyId);

      if (error) throw error;
      toast.success("Proxy deleted");
      fetchProxies();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete proxy");
    }
  };

  // Pagination
  const totalPages = Math.ceil(proxies.length / itemsPerPage);
  const paginatedProxies = proxies.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const availableCount = proxies.filter(p => p.status === "available").length;
  const usedCount = proxies.filter(p => p.status === "used").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Manage Proxies
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="single">Single Proxy</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Proxy</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Proxy Host *</Label>
                <Input
                  placeholder="proxy.example.com"
                  value={singleProxy.host}
                  onChange={(e) => setSingleProxy({ ...singleProxy, host: e.target.value })}
                  className="bg-background"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Proxy Port *</Label>
                <Input
                  placeholder="1080"
                  type="number"
                  value={singleProxy.port}
                  onChange={(e) => setSingleProxy({ ...singleProxy, port: e.target.value })}
                  className="bg-background"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Username (optional)</Label>
                <Input
                  placeholder="username"
                  value={singleProxy.username}
                  onChange={(e) => setSingleProxy({ ...singleProxy, username: e.target.value })}
                  className="bg-background"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password (optional)</Label>
                <Input
                  placeholder="password"
                  type="password"
                  value={singleProxy.password}
                  onChange={(e) => setSingleProxy({ ...singleProxy, password: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>
            <Button onClick={handleAddSingleProxy} disabled={adding} className="w-full">
              {adding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Proxy
            </Button>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Proxy List (Format: host:port or host:port:username:password)
              </Label>
              <Textarea
                placeholder={`192.168.1.1:1080
192.168.1.2:1080:user:pass
proxy.example.com:8080:admin:secret`}
                value={bulkProxies}
                onChange={(e) => setBulkProxies(e.target.value)}
                className="bg-background min-h-[150px] font-mono text-sm"
              />
            </div>
            <Button onClick={handleAddBulkProxies} disabled={adding} className="w-full">
              {adding && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Proxies ({bulkProxies.split("\n").filter(l => l.trim()).length})
            </Button>
          </TabsContent>
        </Tabs>

        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Total: {proxies.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500/20 text-green-400">Available: {availableCount}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-500/20 text-orange-400">Used: {usedCount}</Badge>
          </div>
        </div>

        {/* Proxy Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : paginatedProxies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No proxies added yet
                  </TableCell>
                </TableRow>
              ) : (
                paginatedProxies.map((proxy, index) => (
                  <TableRow key={proxy.id}>
                    <TableCell>{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{proxy.proxy_host}</TableCell>
                    <TableCell>{proxy.proxy_port}</TableCell>
                    <TableCell>{proxy.proxy_username || "-"}</TableCell>
                    <TableCell>
                      <Badge 
                        className={proxy.status === "available" 
                          ? "bg-green-500/20 text-green-400" 
                          : "bg-orange-500/20 text-orange-400"
                        }
                      >
                        {proxy.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestProxy(proxy)}
                          disabled={testingId === proxy.id}
                        >
                          {testingId === proxy.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Test"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteProxy(proxy.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
