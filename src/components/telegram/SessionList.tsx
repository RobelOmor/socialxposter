import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Edit2, Save, X, Phone, Globe, MessageSquare, Reply } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Session {
  id: string;
  phone_number: string;
  session_name: string | null;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
  messages_sent: number | null;
  replies_received: number | null;
}

interface SessionListProps {
  sessions: Session[];
  selectedSessions: string[];
  onSelectionChange: (ids: string[]) => void;
  onSessionsChange: () => void;
}

export const SessionList = ({
  sessions,
  selectedSessions,
  onSelectionChange,
  onSessionsChange,
}: SessionListProps) => {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProxy, setEditProxy] = useState({ host: "", port: "" });

  const handleSelectAll = () => {
    if (selectedSessions.length === sessions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(sessions.map((s) => s.id));
    }
  };

  const handleSelect = (id: string) => {
    if (selectedSessions.includes(id)) {
      onSelectionChange(selectedSessions.filter((s) => s !== id));
    } else {
      onSelectionChange([...selectedSessions, id]);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("telegram_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete session", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Session removed" });
      onSessionsChange();
    }
  };

  const handleEditProxy = (session: Session) => {
    setEditingId(session.id);
    setEditProxy({
      host: session.proxy_host || "",
      port: session.proxy_port?.toString() || "",
    });
  };

  const handleSaveProxy = async (id: string) => {
    const { error } = await supabase
      .from("telegram_sessions")
      .update({
        proxy_host: editProxy.host || null,
        proxy_port: editProxy.port ? parseInt(editProxy.port) : null,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update proxy", variant: "destructive" });
    } else {
      toast({ title: "Updated", description: "Proxy settings saved" });
      setEditingId(null);
      onSessionsChange();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "expired":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Phone className="h-5 w-5" />
          Sessions ({sessions.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedSessions.length === sessions.length && sessions.length > 0}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">Select All</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No sessions uploaded yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border"
              >
                <Checkbox
                  checked={selectedSessions.includes(session.id)}
                  onCheckedChange={() => handleSelect(session.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">
                      +{session.phone_number}
                    </span>
                    <Badge className={getStatusColor(session.status)}>{session.status}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    {editingId === session.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Proxy Host"
                          value={editProxy.host}
                          onChange={(e) => setEditProxy({ ...editProxy, host: e.target.value })}
                          className="h-6 text-xs w-32"
                        />
                        <Input
                          placeholder="Port"
                          value={editProxy.port}
                          onChange={(e) => setEditProxy({ ...editProxy, port: e.target.value })}
                          className="h-6 text-xs w-16"
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleSaveProxy(session.id)}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {session.proxy_host
                            ? `${session.proxy_host}:${session.proxy_port}`
                            : "No proxy"}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          Sent: {session.messages_sent || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <Reply className="h-3 w-3" />
                          Replies: {session.replies_received || 0}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleEditProxy(session)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleDelete(session.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
