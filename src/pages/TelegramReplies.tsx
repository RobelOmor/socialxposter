import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTelegramConfig } from '@/hooks/useTelegramConfig';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  RefreshCw, 
  Loader2,
  Send,
  Eye,
  MessageCircle
} from 'lucide-react';

interface TelegramSession {
  id: string;
  phone_number: string;
  session_name: string | null;
  session_data: string;
  status: string;
  telegram_name: string | null;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_username: string | null;
  proxy_password: string | null;
  messages_sent: number | null;
}

interface ReplyGroupData {
  from_user: string;
  from_user_id: string | null;
  session_id: string;
  session_phone: string;
  session_name: string | null;
  last_reply_at: string;
  reply_count: number;
  replies: {
    id: string;
    message_content: string;
    reply_content: string | null;
    replied: boolean;
    created_at: string;
    replied_at: string | null;
  }[];
}

export default function TelegramReplies() {
  const { user } = useAuth();
  const { config } = useTelegramConfig();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [replyGroups, setReplyGroups] = useState<ReplyGroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [selectedReplyGroup, setSelectedReplyGroup] = useState<ReplyGroupData | null>(null);
  const [conversationReplyContent, setConversationReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user]);

  useEffect(() => {
    if (sessions.length > 0) {
      fetchReplyGroups();
    }
  }, [sessions]);

  const fetchSessions = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('telegram_sessions')
      .select('*')
      .eq('user_id', user.id);

    if (!error && data) {
      setSessions(data);
    }
  };

  const fetchReplyGroups = async () => {
    if (!user) return;
    setLoading(true);

    const { data: replies, error } = await supabase
      .from('telegram_replies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch replies');
      setLoading(false);
      return;
    }

    // Group by from_user + session_id
    const groupMap = new Map<string, ReplyGroupData>();
    
    for (const reply of replies || []) {
      const key = `${reply.from_user}-${reply.session_id}`;
      const session = sessions.find(s => s.id === reply.session_id);
      
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          from_user: reply.from_user,
          from_user_id: reply.from_user_id,
          session_id: reply.session_id || '',
          session_phone: session?.phone_number || 'Unknown',
          session_name: session?.telegram_name || null,
          last_reply_at: reply.created_at,
          reply_count: 0,
          replies: [],
        });
      }

      const group = groupMap.get(key)!;
      group.reply_count++;
      if (group.replies.length < 10) {
        group.replies.push({
          id: reply.id,
          message_content: reply.message_content,
          reply_content: reply.reply_content,
          replied: reply.replied || false,
          created_at: reply.created_at,
          replied_at: reply.replied_at,
        });
      }
      if (new Date(reply.created_at) > new Date(group.last_reply_at)) {
        group.last_reply_at = reply.created_at;
      }
    }

    setReplyGroups(Array.from(groupMap.values()));
    setLoading(false);
  };

  const callVpsProxy = async (endpoint: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('telegram-vps-proxy', {
      body: { endpoint, ...body },
    });
    if (error) throw error;
    return data;
  };

  const openConversation = (group: ReplyGroupData) => {
    setSelectedReplyGroup(group);
    setConversationReplyContent('');
    setConversationOpen(true);
  };

  const handleSendReply = async () => {
    if (!selectedReplyGroup || !conversationReplyContent.trim()) {
      toast.error('Enter a reply message');
      return;
    }

    const session = sessions.find(s => s.id === selectedReplyGroup.session_id);
    if (!session) {
      toast.error('Session not found');
      return;
    }

    // MUST use proxy for reply
    if (!session.proxy_host) {
      toast.error('Session has no proxy configured. Proxy is required for replies.');
      return;
    }

    setSendingReply(true);
    try {
      const data = await callVpsProxy('/send-message', {
        session_data: session.session_data,
        destination: selectedReplyGroup.from_user_id || selectedReplyGroup.from_user,
        message: conversationReplyContent,
        proxy_host: session.proxy_host,
        proxy_port: session.proxy_port,
        proxy_username: session.proxy_username,
        proxy_password: session.proxy_password,
      });

      if (data?.status === 'ok' || data?.success) {
        toast.success('Reply sent successfully');
        setConversationReplyContent('');
        
        // Update session messages_sent
        await supabase
          .from('telegram_sessions')
          .update({ 
            messages_sent: (session.messages_sent || 0) + 1,
            last_used_at: new Date().toISOString()
          })
          .eq('id', session.id);
        
        fetchReplyGroups();
      } else {
        toast.error(data?.error || 'Failed to send reply');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send reply';
      toast.error(errorMessage);
    } finally {
      setSendingReply(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/telegram-manage')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Telegram Replies</h1>
            <p className="text-muted-foreground">View and respond to incoming messages</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{replyGroups.length}</p>
              <p className="text-xs text-muted-foreground">Conversations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-500">
                {replyGroups.reduce((sum, g) => sum + g.reply_count, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Messages</p>
            </CardContent>
          </Card>
        </div>

        {/* Replies Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              All Replies
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchReplyGroups} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : replyGroups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No replies found</p>
                <p className="text-sm mt-2">Incoming messages from Telegram users will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From People</TableHead>
                    <TableHead>To People (Session)</TableHead>
                    <TableHead>Last Reply</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {replyGroups.map((group, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        @{group.from_user}
                      </TableCell>
                      <TableCell>
                        {group.session_name || group.session_phone}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(group.last_reply_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConversation(group)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Reply ({group.reply_count})
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Conversation View Dialog */}
      <Dialog open={conversationOpen} onOpenChange={setConversationOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Conversation with @{selectedReplyGroup?.from_user}
            </DialogTitle>
            <DialogDescription>
              Session: {selectedReplyGroup?.session_name || selectedReplyGroup?.session_phone}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[300px] border rounded-md p-4 bg-muted/20">
            {selectedReplyGroup?.replies.map((reply, index) => (
              <div key={index} className="mb-4">
                {/* Incoming message */}
                <div className="flex justify-start mb-2">
                  <div className="bg-muted rounded-lg px-3 py-2 max-w-[80%]">
                    <p className="text-sm">{reply.message_content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(reply.created_at)}
                    </p>
                  </div>
                </div>
                {/* Outgoing reply if exists */}
                {reply.replied && reply.reply_content && (
                  <div className="flex justify-end">
                    <div className="bg-primary/20 rounded-lg px-3 py-2 max-w-[80%]">
                      <p className="text-sm">{reply.reply_content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {reply.replied_at ? formatDate(reply.replied_at) : 'Sent'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {(!selectedReplyGroup?.replies || selectedReplyGroup.replies.length === 0) && (
              <p className="text-center text-muted-foreground py-4">No messages</p>
            )}
          </ScrollArea>

          {/* Reply Box */}
          <div className="flex gap-2 mt-4">
            <Textarea
              placeholder="Type your reply..."
              value={conversationReplyContent}
              onChange={(e) => setConversationReplyContent(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button 
              onClick={handleSendReply} 
              disabled={sendingReply || !conversationReplyContent.trim()}
            >
              {sendingReply ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
