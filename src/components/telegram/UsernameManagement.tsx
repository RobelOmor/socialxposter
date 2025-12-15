import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTelegramUsernames, TelegramUsername } from "@/hooks/useTelegramUsernames";
import { useTelegramConfig } from "@/hooks/useTelegramConfig";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Upload, Trash2, Send, RefreshCw, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface UsernameManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: { id: string; phone_number: string; telegram_name: string | null; status: string }[];
}

export const UsernameManagement = ({ open, onOpenChange, sessions }: UsernameManagementProps) => {
  const { user } = useAuth();
  const { usernames, stats, loading, addUsernames, updateUsernameStatus, deleteUsername, resetUsernames, fetchUsernames } = useTelegramUsernames();
  const { config } = useTelegramConfig();
  
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const itemsPerPage = 10;

  const filteredUsernames = usernames.filter(u => {
    if (filter === "all") return true;
    return u.status === filter;
  });

  const totalPages = Math.ceil(filteredUsernames.length / itemsPerPage);
  const paginatedUsernames = filteredUsernames.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleBulkAdd = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      toast({ title: "Error", description: "Please enter usernames", variant: "destructive" });
      return;
    }

    setAdding(true);
    const result = await addUsernames(lines);
    setAdding(false);

    if (result.success) {
      toast({ 
        title: "Success", 
        description: `Added ${result.inserted} usernames. ${result.duplicates} duplicates skipped.` 
      });
      setBulkText("");
    } else {
      toast({ title: "Error", description: "Failed to add usernames", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length === 0) {
      toast({ title: "Error", description: "No usernames found in file", variant: "destructive" });
      return;
    }

    setAdding(true);
    const result = await addUsernames(lines);
    setAdding(false);

    if (result.success) {
      toast({ 
        title: "Success", 
        description: `Added ${result.inserted} usernames from file. ${result.duplicates} duplicates skipped.` 
      });
    }
    
    e.target.value = "";
  };

  const handleSendMessages = async () => {
    if (!selectedSession || !messageText.trim()) {
      toast({ title: "Error", description: "Select session and enter message", variant: "destructive" });
      return;
    }

    const session = sessions.find(s => s.id === selectedSession);
    if (!session) return;

    const availableUsernames = usernames.filter(u => u.status === "available");
    if (availableUsernames.length === 0) {
      toast({ title: "Error", description: "No available usernames to send", variant: "destructive" });
      return;
    }

    // Get session data
    const { data: sessionData } = await supabase
      .from("telegram_sessions")
      .select("*")
      .eq("id", selectedSession)
      .single();

    if (!sessionData) {
      toast({ title: "Error", description: "Session not found", variant: "destructive" });
      return;
    }

    setSending(true);
    setSendProgress(0);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < availableUsernames.length; i++) {
      const username = availableUsernames[i];
      
      try {
        const { data, error } = await supabase.functions.invoke("telegram-vps-proxy", {
          body: {
            endpoint: "/send-message",
            session_data: sessionData.session_data,
            destination: username.username,
            message: messageText,
            proxy_host: sessionData.proxy_host,
            proxy_port: sessionData.proxy_port,
            proxy_username: sessionData.proxy_username,
            proxy_password: sessionData.proxy_password,
          }
        });

        if (error || (data && !data.success && data.status !== "ok")) {
          await updateUsernameStatus(username.id, "problem", data?.error || "Failed to send");
          failCount++;
        } else {
          await updateUsernameStatus(username.id, "used");
          successCount++;
          
          // Log successful message
          await supabase.from("telegram_messages").insert({
            user_id: user?.id,
            session_id: selectedSession,
            destination: username.username,
            message_content: messageText,
            status: "sent",
            sent_at: new Date().toISOString()
          });
        }
      } catch (err) {
        await updateUsernameStatus(username.id, "problem", "Network error");
        failCount++;
      }

      setSendProgress(((i + 1) / availableUsernames.length) * 100);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setSending(false);
    setSendProgress(0);
    
    // Update session stats
    await supabase
      .from("telegram_sessions")
      .update({ 
        messages_sent: (sessionData.messages_sent || 0) + successCount,
        last_used_at: new Date().toISOString()
      })
      .eq("id", selectedSession);

    toast({ 
      title: "Complete", 
      description: `Sent: ${successCount}, Failed: ${failCount}` 
    });
    
    await fetchUsernames();
  };

  const handleResetSelected = async () => {
    const problemIds = usernames.filter(u => u.status === "problem").map(u => u.id);
    if (problemIds.length === 0) {
      toast({ title: "Info", description: "No problem usernames to reset" });
      return;
    }
    
    await resetUsernames(problemIds);
    toast({ title: "Success", description: `Reset ${problemIds.length} usernames to available` });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-green-500/20 text-green-400">Available</Badge>;
      case "used":
        return <Badge className="bg-blue-500/20 text-blue-400">Used</Badge>;
      case "problem":
        return <Badge className="bg-red-500/20 text-red-400">Problem</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const activeSessions = sessions.filter(s => s.status === "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>TG Username Management</DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/50 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="bg-green-500/10 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{stats.available}</div>
            <div className="text-xs text-muted-foreground">Available</div>
          </div>
          <div className="bg-blue-500/10 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.used}</div>
            <div className="text-xs text-muted-foreground">Used</div>
          </div>
          <div className="bg-red-500/10 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-400">{stats.problem}</div>
            <div className="text-xs text-muted-foreground">Problem</div>
          </div>
        </div>

        <Tabs defaultValue="add">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="add">Add Usernames</TabsTrigger>
            <TabsTrigger value="send">Send Messages</TabsTrigger>
            <TabsTrigger value="list">Username List</TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="space-y-4">
            <div className="space-y-3">
              <Textarea
                placeholder="Enter usernames (one per line)&#10;@username1&#10;username2&#10;username3"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
              />
              <div className="flex gap-2">
                <Button onClick={handleBulkAdd} disabled={adding} className="flex-1">
                  {adding ? "Adding..." : "Add Usernames"}
                </Button>
                <label>
                  <Input
                    type="file"
                    accept=".txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button variant="outline" asChild disabled={adding}>
                    <span><Upload className="w-4 h-4 mr-2" /> Upload .txt</span>
                  </Button>
                </label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="send" className="space-y-4">
            <div className="space-y-3">
              <Select value={selectedSession} onValueChange={setSelectedSession}>
                <SelectTrigger>
                  <SelectValue placeholder="Select session to send from" />
                </SelectTrigger>
                <SelectContent>
                  {activeSessions.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.phone_number} {s.telegram_name ? `(${s.telegram_name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Textarea
                placeholder="Enter message to send..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={4}
              />
              
              {sending && (
                <div className="space-y-2">
                  <Progress value={sendProgress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Sending... {Math.round(sendProgress)}%
                  </p>
                </div>
              )}
              
              <Button 
                onClick={handleSendMessages} 
                disabled={sending || stats.available === 0}
                className="w-full"
              >
                <Send className="w-4 h-4 mr-2" />
                Send to {stats.available} Available Usernames
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="list" className="space-y-4">
            {/* Filter and Actions */}
            <div className="flex gap-2 items-center justify-between">
              <div className="flex gap-2">
                <Select value={filter} onValueChange={(v) => { setFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[140px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({stats.total})</SelectItem>
                    <SelectItem value="available">Available ({stats.available})</SelectItem>
                    <SelectItem value="used">Used ({stats.used})</SelectItem>
                    <SelectItem value="problem">Problem ({stats.problem})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleResetSelected}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Reset Problems
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead className="w-16">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsernames.map((u, idx) => (
                    <TableRow key={u.id}>
                      <TableCell>{(currentPage - 1) * itemsPerPage + idx + 1}</TableCell>
                      <TableCell className="font-mono">@{u.username}</TableCell>
                      <TableCell>{getStatusBadge(u.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                        {u.error_message || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {u.sent_at ? new Date(u.sent_at).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteUsername(u.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedUsernames.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No usernames found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
