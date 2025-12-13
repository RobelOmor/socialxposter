import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Edit2, Save, X, Phone, Globe, MessageSquare, Reply, Send, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Session {
  id: string;
  phone_number: string;
  session_name: string | null;
  telegram_name: string | null;
  session_data: string;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_username: string | null;
  proxy_password: string | null;
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
  
  // Single message dialog state
  const [singleMsgOpen, setSingleMsgOpen] = useState(false);
  const [singleMsgSession, setSingleMsgSession] = useState<Session | null>(null);
  const [singleUsername, setSingleUsername] = useState("");
  const [singleMessage, setSingleMessage] = useState("");
  const [sendingSingle, setSendingSingle] = useState(false);

  // Bulk message dialog state
  const [bulkMsgOpen, setBulkMsgOpen] = useState(false);
  const [bulkMsgSession, setBulkMsgSession] = useState<Session | null>(null);
  const [bulkUsernames, setBulkUsernames] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

  // Reply dialog state
  const [replyOpen, setReplyOpen] = useState(false);
  const [replySession, setReplySession] = useState<Session | null>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

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

  // Single message handler
  const handleSendSingleMessage = async () => {
    if (!singleMsgSession || !singleUsername.trim() || !singleMessage.trim()) {
      toast({ title: "Error", description: "Username and message are required", variant: "destructive" });
      return;
    }

    setSendingSingle(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-vps-proxy', {
        body: {
          endpoint: '/send-message',
          method: 'POST',
          body: {
            session_data: singleMsgSession.session_data,
            destination: singleUsername.trim(),
            message: singleMessage.trim(),
            proxy: singleMsgSession.proxy_host ? {
              host: singleMsgSession.proxy_host,
              port: singleMsgSession.proxy_port,
              username: singleMsgSession.proxy_username,
              password: singleMsgSession.proxy_password,
            } : null,
          }
        }
      });

      if (error) {
        throw error;
      }

      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }

      // Update messages_sent count
      await supabase
        .from('telegram_sessions')
        .update({ messages_sent: (singleMsgSession.messages_sent || 0) + 1, last_used_at: new Date().toISOString() })
        .eq('id', singleMsgSession.id);

      // Log message
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await supabase.from('telegram_messages').insert({
          user_id: userData.user.id,
          session_id: singleMsgSession.id,
          destination: singleUsername.trim(),
          message_content: singleMessage.trim(),
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
      }

      toast({ title: "Success", description: `Message sent to ${singleUsername}` });
      setSingleMsgOpen(false);
      setSingleUsername("");
      setSingleMessage("");
      onSessionsChange();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || 'Failed to send message', variant: "destructive" });
    } finally {
      setSendingSingle(false);
    }
  };
  // Bulk message handler
  const handleSendBulkMessages = async () => {
    if (!bulkMsgSession || !bulkUsernames.trim() || !bulkMessage.trim()) {
      toast({ title: "Error", description: "Usernames and message are required", variant: "destructive" });
      return;
    }

    const usernames = bulkUsernames.split('\n').map(u => u.trim()).filter(u => u);
    if (usernames.length === 0) {
      toast({ title: "Error", description: "No valid usernames provided", variant: "destructive" });
      return;
    }

    setSendingBulk(true);
    setBulkProgress({ current: 0, total: usernames.length, success: 0, failed: 0 });

    const { data: userData } = await supabase.auth.getUser();
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < usernames.length; i++) {
      const username = usernames[i];
      try {
        const { data, error } = await supabase.functions.invoke('telegram-vps-proxy', {
          body: {
            endpoint: '/send-message',
            method: 'POST',
            body: {
              session_data: bulkMsgSession.session_data,
              destination: username,
              message: bulkMessage.trim(),
              proxy: bulkMsgSession.proxy_host ? {
                host: bulkMsgSession.proxy_host,
                port: bulkMsgSession.proxy_port,
                username: bulkMsgSession.proxy_username,
                password: bulkMsgSession.proxy_password,
              } : null,
            }
          }
        });

        if (error) {
          failedCount++;
          if (userData?.user) {
            await supabase.from('telegram_messages').insert({
              user_id: userData.user.id,
              session_id: bulkMsgSession.id,
              destination: username,
              message_content: bulkMessage.trim(),
              status: 'failed',
              error_message: error.message,
            });
          }
        } else if (data && (data as any).error) {
          failedCount++;
          if (userData?.user) {
            await supabase.from('telegram_messages').insert({
              user_id: userData.user.id,
              session_id: bulkMsgSession.id,
              destination: username,
              message_content: bulkMessage.trim(),
              status: 'failed',
              error_message: (data as any).error,
            });
          }
        } else {
          successCount++;
          if (userData?.user) {
            await supabase.from('telegram_messages').insert({
              user_id: userData.user.id,
              session_id: bulkMsgSession.id,
              destination: username,
              message_content: bulkMessage.trim(),
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
          }
        }
      } catch (err: any) {
        failedCount++;
      }

      setBulkProgress({ current: i + 1, total: usernames.length, success: successCount, failed: failedCount });
    }

    // Update session stats
    await supabase
      .from('telegram_sessions')
      .update({ 
        messages_sent: (bulkMsgSession.messages_sent || 0) + successCount, 
        last_used_at: new Date().toISOString() 
      })
      .eq('id', bulkMsgSession.id);

    toast({ 
      title: "Bulk Send Complete", 
      description: `Success: ${successCount}, Failed: ${failedCount}` 
    });
    
    setSendingBulk(false);
    setBulkMsgOpen(false);
    setBulkUsernames("");
    setBulkMessage("");
    onSessionsChange();
  };

  // Load replies for session
  const loadReplies = async (session: Session) => {
    setReplySession(session);
    setReplyOpen(true);
    setLoadingReplies(true);
    
    try {
      const { data, error } = await supabase
        .from('telegram_replies')
        .select('*')
        .eq('session_id', session.id)
        .eq('replied', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReplies(data || []);
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to load replies", variant: "destructive" });
    } finally {
      setLoadingReplies(false);
    }
  };

  // Send reply
  const handleSendReply = async () => {
    if (!replySession || !replyingTo || !replyContent.trim()) {
      toast({ title: "Error", description: "Reply content is required", variant: "destructive" });
      return;
    }

    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-vps-proxy', {
        body: {
          endpoint: '/send-message',
          method: 'POST',
          body: {
            session_data: replySession.session_data,
            destination: replyingTo.from_user_id || replyingTo.from_user,
            message: replyContent.trim(),
            proxy: replySession.proxy_host ? {
              host: replySession.proxy_host,
              port: replySession.proxy_port,
              username: replySession.proxy_username,
              password: replySession.proxy_password,
            } : null,
          }
        }
      });

      if (error) {
        throw error;
      }

      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }

      // Mark as replied
      await supabase
        .from('telegram_replies')
        .update({ 
          replied: true, 
          replied_at: new Date().toISOString(),
          reply_content: replyContent.trim()
        })
        .eq('id', replyingTo.id);

      toast({ title: "Success", description: "Reply sent" });
      setReplyingTo(null);
      setReplyContent("");
      loadReplies(replySession);
      onSessionsChange();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || 'Failed to send reply', variant: "destructive" });
    } finally {
      setSendingReply(false);
    }
  };

  const handleMarkReply = async (replyId: string) => {
    try {
      await supabase
        .from('telegram_replies')
        .update({ 
          replied: true,
          replied_at: new Date().toISOString(),
        })
        .eq('id', replyId);

      toast({ title: "Marked", description: "Reply marked as handled" });
      if (replySession) {
        loadReplies(replySession);
      }
      onSessionsChange();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || 'Failed to mark reply', variant: "destructive" });
    }
  };
  return (
    <>
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
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
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
                      {session.telegram_name && (
                        <span className="text-sm text-muted-foreground">({session.telegram_name})</span>
                      )}
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
                    {/* Single Message Button */}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-primary"
                      disabled={session.status !== 'active'}
                      onClick={() => { setSingleMsgSession(session); setSingleMsgOpen(true); }}
                      title="Send Single Message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    {/* Bulk Message Button */}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-blue-400"
                      disabled={session.status !== 'active'}
                      onClick={() => { setBulkMsgSession(session); setBulkMsgOpen(true); }}
                      title="Send Bulk Messages"
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                    {/* Reply Button */}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-green-400"
                      disabled={session.status !== 'active'}
                      onClick={() => loadReplies(session)}
                      title="View & Reply"
                    >
                      <Reply className="h-4 w-4" />
                    </Button>
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

      {/* Single Message Dialog */}
      <Dialog open={singleMsgOpen} onOpenChange={setSingleMsgOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Send Single Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Session: +{singleMsgSession?.phone_number} {singleMsgSession?.telegram_name && `(${singleMsgSession.telegram_name})`}
            </p>
            <div>
              <Label>Username / User ID</Label>
              <Input
                placeholder="@username or user_id"
                value={singleUsername}
                onChange={(e) => setSingleUsername(e.target.value)}
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                placeholder="Enter your message..."
                value={singleMessage}
                onChange={(e) => setSingleMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleMsgOpen(false)}>Cancel</Button>
            <Button onClick={handleSendSingleMessage} disabled={sendingSingle}>
              {sendingSingle ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Message Dialog */}
      <Dialog open={bulkMsgOpen} onOpenChange={setBulkMsgOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Send Bulk Messages</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Session: +{bulkMsgSession?.phone_number} {bulkMsgSession?.telegram_name && `(${bulkMsgSession.telegram_name})`}
            </p>
            <div>
              <Label>Usernames (one per line)</Label>
              <Textarea
                placeholder="@user1&#10;@user2&#10;123456789"
                value={bulkUsernames}
                onChange={(e) => setBulkUsernames(e.target.value)}
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {bulkUsernames.split('\n').filter(u => u.trim()).length} usernames
              </p>
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                placeholder="Enter your message..."
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                rows={4}
              />
            </div>
            {sendingBulk && (
              <div className="space-y-2">
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {bulkProgress.current}/{bulkProgress.total} | ✓ {bulkProgress.success} | ✗ {bulkProgress.failed}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMsgOpen(false)} disabled={sendingBulk}>Cancel</Button>
            <Button onClick={handleSendBulkMessages} disabled={sendingBulk}>
              {sendingBulk ? "Sending..." : "Send All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply Dialog */}
      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Replies - +{replySession?.phone_number} {replySession?.telegram_name && `(${replySession.telegram_name})`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loadingReplies ? (
              <p className="text-center text-muted-foreground py-4">Loading replies...</p>
            ) : replies.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No pending replies</p>
            ) : (
              <div className="space-y-3">
                {replies.map((reply) => (
                  <div key={reply.id} className="p-3 bg-background rounded-lg border border-border">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{reply.from_user}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(reply.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{reply.message_content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {replyingTo?.id === reply.id ? (
                        <div className="flex-1 space-y-2">
                          <Textarea
                            placeholder="Type your reply..."
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSendReply} disabled={sendingReply}>
                              {sendingReply ? "Sending..." : "Send Reply"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setReplyingTo(null); setReplyContent(""); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setReplyingTo(reply)}
                        >
                          Reply
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleMarkReply(reply.id)}
                      >
                        Mark
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
