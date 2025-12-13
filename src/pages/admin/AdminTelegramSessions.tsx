import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AdminTelegramConfig } from '@/components/telegram/AdminTelegramConfig';
import { 
  Loader2,
  Check,
  X,
  MessageSquare,
  Users,
  Settings,
  Send
} from 'lucide-react';

interface TelegramSession {
  id: string;
  phone_number: string;
  session_name: string | null;
  session_data: string;
  telegram_name: string | null;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_username: string | null;
  proxy_password: string | null;
  messages_sent: number | null;
  replies_received: number | null;
  created_at: string;
  user_id: string;
}

interface SessionStats {
  total: number;
  active: number;
  expired: number;
  totalMessages: number;
  totalReplies: number;
}

export default function AdminTelegramSessions() {
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<SessionStats>({
    total: 0,
    active: 0,
    expired: 0,
    totalMessages: 0,
    totalReplies: 0,
  });
  
  // Send message dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TelegramSession | null>(null);
  const [targetUsername, setTargetUsername] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('telegram_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch sessions');
    } else {
      const sessionsData = (data || []) as TelegramSession[];
      setSessions(sessionsData);
      
      // Calculate stats
      const active = sessionsData.filter(s => s.status === 'active').length;
      const expired = sessionsData.filter(s => s.status === 'expired').length;
      const totalMessages = sessionsData.reduce((sum, s) => sum + (s.messages_sent || 0), 0);
      const totalReplies = sessionsData.reduce((sum, s) => sum + (s.replies_received || 0), 0);
      
      setStats({
        total: sessionsData.length,
        active,
        expired,
        totalMessages,
        totalReplies,
      });
    }
    setLoading(false);
  };

  const filteredSessions = sessions.filter(session => {
    if (!searchQuery) return true;
    return session.phone_number.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Expired</Badge>;
      case 'suspended':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Suspended</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">{status}</Badge>;
    }
  };

  const openSendDialog = (session: TelegramSession) => {
    setSelectedSession(session);
    setTargetUsername('');
    setMessageContent('');
    setSendDialogOpen(true);
  };

  const handleSendMessage = async () => {
    if (!selectedSession || !targetUsername.trim() || !messageContent.trim()) {
      toast.error('Please enter username and message');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-vps-proxy', {
        body: {
          endpoint: '/send-message',
          method: 'POST',
          body: {
            session_data: selectedSession.session_data,
            destination: targetUsername.trim(),
            message: messageContent.trim(),
            proxy: selectedSession.proxy_host ? {
              host: selectedSession.proxy_host,
              port: selectedSession.proxy_port,
              username: selectedSession.proxy_username,
              password: selectedSession.proxy_password,
            } : null,
          },
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Message sent to ${targetUsername}`);
        
        // Update session message count
        await supabase
          .from('telegram_sessions')
          .update({ 
            messages_sent: (selectedSession.messages_sent || 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', selectedSession.id);
        
        setSendDialogOpen(false);
        fetchSessions();
      } else {
        toast.error(data?.error || 'Failed to send message');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telegram Management</h1>
          <p className="text-muted-foreground">Configure VPS, API settings, and manage all sessions</p>
        </div>

        <Tabs defaultValue="config" className="space-y-6">
          <TabsList>
            <TabsTrigger value="config" className="gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              All Sessions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <AdminTelegramConfig />
          </TabsContent>

          <TabsContent value="sessions" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{stats.total}</p>
                      <p className="text-xs text-muted-foreground">Total Sessions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold text-green-500">{stats.active}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <X className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-2xl font-bold text-red-500">{stats.expired}</p>
                      <p className="text-xs text-muted-foreground">Expired</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold text-blue-500">{stats.totalMessages}</p>
                      <p className="text-xs text-muted-foreground">Messages Sent</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-500" />
                    <div>
                      <p className="text-2xl font-bold text-purple-500">{stats.totalReplies}</p>
                      <p className="text-xs text-muted-foreground">Replies</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <div className="flex gap-2">
              <Input
                placeholder="Search by phone number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {/* Sessions Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Telegram Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Replies</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          No sessions found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSessions.map((session, index) => (
                        <TableRow key={session.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{session.phone_number}</TableCell>
                          <TableCell>{session.telegram_name || '-'}</TableCell>
                          <TableCell>{getStatusBadge(session.status)}</TableCell>
                          <TableCell>
                            {session.proxy_host ? (
                              <span className="text-xs text-muted-foreground">
                                {session.proxy_host}:{session.proxy_port}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">No proxy</span>
                            )}
                          </TableCell>
                          <TableCell>{session.messages_sent || 0}</TableCell>
                          <TableCell>{session.replies_received || 0}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(session.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openSendDialog(session)}
                              disabled={session.status !== 'active'}
                              title="Send Message"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Send Message Dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Message</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                From: <span className="text-foreground font-medium">{selectedSession?.phone_number}</span>
                {selectedSession?.telegram_name && (
                  <span> ({selectedSession.telegram_name})</span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Target Username</Label>
                <Input
                  placeholder="@username or user_id"
                  value={targetUsername}
                  onChange={(e) => setTargetUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="Enter your message..."
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendMessage} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
