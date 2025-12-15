import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTelegramConfig } from '@/hooks/useTelegramConfig';
import { PhoneVerification } from '@/components/telegram/PhoneVerification';
import { SessionUpload } from '@/components/telegram/SessionUpload';
import { ProxyManagement } from '@/components/telegram/ProxyManagement';
import { 
  Plus, 
  RefreshCw, 
  Trash2, 
  Loader2,
  Send,
  Download,
  Pencil,
  MessageSquare,
  AlertCircle,
  Mail,
  Globe
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

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
  replies_received: number | null;
  created_at: string;
  last_used_at: string | null;
}

interface UnreadMessage {
  chat_id: number | string;
  from_user_name: string;
  from_user_id: number | string;
  text: string;
  message_id: number;
  date: string;
}

export default function TelegramManage() {
  const { user } = useAuth();
  const { config, loading: configLoading } = useTelegramConfig();
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [addProxyOpen, setAddProxyOpen] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk message state
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [usernames, setUsernames] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendReport, setSendReport] = useState<{
    success: number;
    failed: number;
    total: number;
    details: { username: string; status: 'success' | 'failed'; error?: string }[];
  } | null>(null);

  // Single message state (per session)
  const [singleMessageOpen, setSingleMessageOpen] = useState(false);
  const [singleSession, setSingleSession] = useState<TelegramSession | null>(null);
  const [singleUsername, setSingleUsername] = useState('');
  const [singleContent, setSingleContent] = useState('');
  const [sendingSingle, setSendingSingle] = useState(false);

  // Edit proxy state
  const [editProxyOpen, setEditProxyOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TelegramSession | null>(null);
  const [editProxyHost, setEditProxyHost] = useState('');
  const [editProxyPort, setEditProxyPort] = useState('');
  const [editProxyUsername, setEditProxyUsername] = useState('');
  const [editProxyPassword, setEditProxyPassword] = useState('');
  const [savingProxy, setSavingProxy] = useState(false);

  // Bulk delete state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Unread messages state
  const [unreadDialogOpen, setUnreadDialogOpen] = useState(false);
  const [unreadSession, setUnreadSession] = useState<TelegramSession | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessage[]>([]);
  const [unreadLoading, setUnreadLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<UnreadMessage | null>(null);
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user]);

  const fetchSessions = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('telegram_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch sessions');
    } else {
      setSessions((data || []) as TelegramSession[]);
    }
    setLoading(false);
  };

  // Selection handlers
  const handleSelectSession = (sessionId: string, checked: boolean) => {
    const newSelected = new Set(selectedSessions);
    if (checked) {
      newSelected.add(sessionId);
    } else {
      newSelected.delete(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const filteredSessionIds = filteredSessions.map(s => s.id);
      setSelectedSessions(new Set(filteredSessionIds));
    } else {
      setSelectedSessions(new Set());
    }
  };

  // Delete handlers
  const handleDeleteSession = async (session: TelegramSession) => {
    if (!confirm('Are you sure you want to remove this session?')) return;

    const { error } = await supabase
      .from('telegram_sessions')
      .delete()
      .eq('id', session.id);

    if (error) {
      toast.error('Failed to delete session');
    } else {
      toast.success('Session removed');
      fetchSessions();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSessions.size === 0) return;

    setBulkDeleting(true);

    try {
      const { error } = await supabase
        .from('telegram_sessions')
        .delete()
        .in('id', Array.from(selectedSessions));

      if (error) throw error;

      toast.success(`${selectedSessions.size} session(s) removed successfully`);
      setSelectedSessions(new Set());
      setDeleteConfirmOpen(false);
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete sessions');
    }

    setBulkDeleting(false);
  };

  // Edit proxy handlers
  const openEditProxy = (session: TelegramSession) => {
    setEditingSession(session);
    setEditProxyHost(session.proxy_host || '');
    setEditProxyPort(session.proxy_port?.toString() || '');
    setEditProxyUsername(session.proxy_username || '');
    setEditProxyPassword(session.proxy_password || '');
    setEditProxyOpen(true);
  };

  const handleSaveProxy = async () => {
    if (!editingSession) return;

    setSavingProxy(true);

    try {
      const { error } = await supabase
        .from('telegram_sessions')
        .update({
          proxy_host: editProxyHost || null,
          proxy_port: editProxyPort ? parseInt(editProxyPort) : null,
          proxy_username: editProxyUsername || null,
          proxy_password: editProxyPassword || null,
        })
        .eq('id', editingSession.id);

      if (error) throw error;

      toast.success('Proxy settings updated');
      setEditProxyOpen(false);
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update proxy');
    }

    setSavingProxy(false);
  };

  // Helper to call VPS via proxy
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

  // Fetch unread count for a session
  const fetchUnreadCount = async (session: TelegramSession) => {
    try {
      const data = await callVpsProxy("/get-unread", {
        session_data: session.session_data,
        api_id: config.apiId,
        api_hash: config.apiHash,
        proxy: session.proxy_host ? {
          host: session.proxy_host,
          port: session.proxy_port,
          username: session.proxy_username,
          password: session.proxy_password,
        } : null,
      });
      
      if (data && data.total_unread !== undefined) {
        setUnreadCounts(prev => ({ ...prev, [session.id]: data.total_unread }));
      }
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  };

  // Fetch all unread counts on load
  useEffect(() => {
    if (sessions.length > 0 && config.apiId) {
      sessions.filter(s => s.status === 'active').forEach(session => {
        fetchUnreadCount(session);
      });
    }
  }, [sessions, config.apiId]);

  // Open unread messages dialog
  const openUnreadDialog = async (session: TelegramSession) => {
    setUnreadSession(session);
    setUnreadMessages([]);
    setUnreadDialogOpen(true);
    setUnreadLoading(true);
    setReplyingTo(null);
    setReplyContent('');

    try {
      const data = await callVpsProxy("/get-unread", {
        session_data: session.session_data,
        api_id: config.apiId,
        api_hash: config.apiHash,
        proxy: session.proxy_host ? {
          host: session.proxy_host,
          port: session.proxy_port,
          username: session.proxy_username,
          password: session.proxy_password,
        } : null,
      });

      if (data && data.messages) {
        // Map from_user_id to chat_id for reply functionality
        const mappedMessages = data.messages.map((msg: any) => ({
          ...msg,
          chat_id: msg.chat_id || msg.from_user_id, // Use from_user_id as chat_id for private chats
        }));
        setUnreadMessages(mappedMessages);
        setUnreadCounts(prev => ({ ...prev, [session.id]: data.total_unread || 0 }));
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch unread messages");
    }
    setUnreadLoading(false);
  };

  // Send reply to a message
  const handleSendReply = async () => {
    if (!unreadSession || !replyingTo || !replyContent.trim()) {
      toast.error("Enter a reply message");
      return;
    }

    setSendingReply(true);
    try {
      // Send chat_id as string - VPS will convert to int for Telegram API
      const data = await callVpsProxy("/reply-message", {
        session_data: unreadSession.session_data,
        chat_id: String(replyingTo.chat_id),
        message: replyContent.trim(),
        api_id: config.apiId,
        api_hash: config.apiHash,
        proxy: unreadSession.proxy_host ? {
          host: unreadSession.proxy_host,
          port: unreadSession.proxy_port,
          username: unreadSession.proxy_username,
          password: unreadSession.proxy_password,
        } : null,
      });

      if (data && (data.success || data.status === "ok")) {
        toast.success(`Reply sent to ${replyingTo.from_user_name}`);
        
        // Update session stats
        await supabase
          .from('telegram_sessions')
          .update({
            messages_sent: (unreadSession.messages_sent || 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', unreadSession.id);

        // Remove the message from list
        setUnreadMessages(prev => prev.filter(m => m.chat_id !== replyingTo.chat_id));
        setUnreadCounts(prev => ({ 
          ...prev, 
          [unreadSession.id]: Math.max(0, (prev[unreadSession.id] || 1) - 1) 
        }));
        setReplyingTo(null);
        setReplyContent('');
        fetchSessions();
      } else {
        throw new Error(data?.error || "Failed to send reply");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send reply");
    }
    setSendingReply(false);
  };

  // Validate session
  const handleValidateSession = async (session: TelegramSession) => {
    try {
      const data = await callVpsProxy("/validate-session", {
        session_data: session.session_data,
        api_id: config.apiId,
        api_hash: config.apiHash,
        proxy: session.proxy_host ? {
          host: session.proxy_host,
          port: session.proxy_port,
          username: session.proxy_username,
          password: session.proxy_password,
        } : null,
      });

      if (data.valid) {
        await supabase
          .from('telegram_sessions')
          .update({ 
            status: 'active',
            telegram_name: data.user_name || data.first_name || data.username || null
          })
          .eq('id', session.id);
        toast.success(`Session valid${data.first_name ? ': ' + data.first_name : ''}`);
      } else {
        await supabase
          .from('telegram_sessions')
          .update({ status: 'expired' })
          .eq('id', session.id);
        toast.error(data.error || 'Session expired');
      }
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to validate session');
    }
  };

  // Single message handler
  const handleSendSingleMessage = async () => {
    if (!singleSession || !singleUsername.trim() || !singleContent.trim()) {
      toast.error('Enter username and message');
      return;
    }

    setSendingSingle(true);
    try {
      const data = await callVpsProxy('/send-message', {
        session_data: singleSession.session_data,
        destination: singleUsername.trim(),
        message: singleContent.trim(),
        proxy: singleSession.proxy_host
          ? {
              host: singleSession.proxy_host,
              port: singleSession.proxy_port,
              username: singleSession.proxy_username,
              password: singleSession.proxy_password,
            }
          : null,
      });

      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }

      await supabase
        .from('telegram_sessions')
        .update({
          messages_sent: (singleSession.messages_sent || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', singleSession.id);

      if (user) {
        await supabase.from('telegram_messages').insert({
          user_id: user.id,
          session_id: singleSession.id,
          destination: singleUsername.trim(),
          message_content: singleContent.trim(),
          status: 'sent',
          sent_at: new Date().toISOString(),
        });
      }

      toast.success(`Message sent to ${singleUsername.trim()}`);
      setSingleMessageOpen(false);
      setSingleUsername('');
      setSingleContent('');
      setSingleSession(null);
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message');
    } finally {
      setSendingSingle(false);
    }
  };

  // Bulk message handler
  const handleBulkMessage = async () => {
    if (selectedSessions.size === 0) {
      toast.error('Select at least one session');
      return;
    }
    if (!usernames.trim()) {
      toast.error('Enter usernames');
      return;
    }
    if (!messageContent.trim()) {
      toast.error('Enter message content');
      return;
    }

    setSending(true);
    setSendProgress(0);
    setSendReport(null);

    const usernameList = usernames.split('\n').map(u => u.trim()).filter(u => u);
    const selectedSessionsArray = sessions.filter(s => selectedSessions.has(s.id));
    
    const results: { username: string; status: 'success' | 'failed'; error?: string }[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < usernameList.length; i++) {
      const username = usernameList[i];
      const session = selectedSessionsArray[i % selectedSessionsArray.length];

      try {
        const data = await callVpsProxy("/send-message", {
          session_data: session.session_data,
          destination: username,
          message: messageContent,
          proxy: session.proxy_host ? {
            host: session.proxy_host,
            port: session.proxy_port,
            username: session.proxy_username,
            password: session.proxy_password,
          } : null,
        });

        if (data.success) {
          successCount++;
          results.push({ username, status: 'success' });

          // Update session stats
          await supabase
            .from('telegram_sessions')
            .update({ 
              messages_sent: (session.messages_sent || 0) + 1,
              last_used_at: new Date().toISOString()
            })
            .eq('id', session.id);

          // Log message
          await supabase
            .from('telegram_messages')
            .insert({
              user_id: user?.id,
              session_id: session.id,
              destination: username,
              message_content: messageContent,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
        } else {
          failCount++;
          results.push({ username, status: 'failed', error: data.error });
        }
      } catch (error: any) {
        failCount++;
        results.push({ username, status: 'failed', error: error.message });
      }

      setSendProgress(((i + 1) / usernameList.length) * 100);
    }

    setSendReport({
      success: successCount,
      failed: failCount,
      total: usernameList.length,
      details: results,
    });

    setSending(false);
    fetchSessions();
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (selectedSessions.size === 0) {
      toast.error('Select sessions to export');
      return;
    }

    const selectedData = sessions.filter(s => selectedSessions.has(s.id));
    const csvContent = [
      ['Phone Number', 'Session Name', 'Status', 'Proxy Host', 'Proxy Port', 'Messages Sent', 'Replies Received', 'Created At'].join(','),
      ...selectedData.map(s => [
        s.phone_number,
        s.session_name || '',
        s.status,
        s.proxy_host || '',
        s.proxy_port || '',
        s.messages_sent || 0,
        s.replies_received || 0,
        s.created_at,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telegram_sessions_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast.success('CSV exported');
  };

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    if (!searchQuery) return true;
    return session.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
           session.session_name?.toLowerCase().includes(searchQuery.toLowerCase());
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

  // Check if Telegram is active
  if (!configLoading && !config.isActive) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center space-y-4">
              <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto" />
              <h2 className="text-xl font-semibold">Telegram Features Disabled</h2>
              <p className="text-muted-foreground">
                Telegram features are currently disabled by the administrator. Please contact support for more information.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Telegram Manage</h1>
            <p className="text-muted-foreground">Manage sessions, send messages, track replies</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setAddProxyOpen(true)} variant="outline" className="gap-2">
              <Globe className="h-4 w-4" />
              Add Proxy
            </Button>
            <Button onClick={() => setAddSessionOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Session
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{sessions.length}</div>
              <div className="text-xs text-muted-foreground">Total Sessions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-500">
                {sessions.filter(s => s.status === 'active').length}
              </div>
              <div className="text-xs text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-500">
                {sessions.reduce((sum, s) => sum + (s.messages_sent || 0), 0)}
              </div>
              <div className="text-xs text-muted-foreground">Messages Sent</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-500">
                {sessions.reduce((sum, s) => sum + (s.replies_received || 0), 0)}
              </div>
              <div className="text-xs text-muted-foreground">Replies</div>
            </CardContent>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search by phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
          
          {selectedSessions.size > 0 && (
            <>
              <Button onClick={() => setBulkMessageOpen(true)} variant="outline" className="gap-2">
                <Send className="h-4 w-4" />
                Send Message ({selectedSessions.size})
              </Button>
              <Button onClick={handleExportCSV} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button onClick={() => setDeleteConfirmOpen(true)} variant="destructive" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete ({selectedSessions.size})
              </Button>
            </>
          )}
        </div>

        {/* Sessions Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedSessions.size === filteredSessions.length && filteredSessions.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
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
                    <TableCell colSpan={10} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No sessions found. Add your first session to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSessions.map((session, index) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSessions.has(session.id)}
                          onCheckedChange={(checked) => handleSelectSession(session.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{session.phone_number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.telegram_name || '-'}
                      </TableCell>
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
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 px-2 h-auto py-1"
                          disabled={session.status !== 'active'}
                          onClick={() => openUnreadDialog(session)}
                        >
                          <Mail className="h-3 w-3" />
                          <span className={unreadCounts[session.id] > 0 ? "text-primary font-medium" : ""}>
                            {unreadCounts[session.id] !== undefined ? unreadCounts[session.id] : '-'}
                          </span>
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(session.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleValidateSession(session)}
                            title="Validate"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={session.status !== 'active'}
                            onClick={() => {
                              setSingleSession(session);
                              setSingleUsername('');
                              setSingleContent('');
                              setSingleMessageOpen(true);
                            }}
                            title="Send Single Message"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditProxy(session)}
                            title="Edit Proxy"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteSession(session)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add Session Dialog */}
      <Dialog open={addSessionOpen} onOpenChange={setAddSessionOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Telegram Session</DialogTitle>
            <DialogDescription>Add session via phone verification or file upload</DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="phone" className="space-y-4">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="phone">Phone Verification</TabsTrigger>
              <TabsTrigger value="upload">Session File Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="phone">
              <PhoneVerification
                apiId={config.apiId}
                apiHash={config.apiHash}
                onSessionAdded={() => {
                  fetchSessions();
                  setAddSessionOpen(false);
                }}
              />
            </TabsContent>

            <TabsContent value="upload">
              <SessionUpload onSessionAdded={() => {
                fetchSessions();
                setAddSessionOpen(false);
              }} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Single Message Dialog */}
      <Dialog open={singleMessageOpen} onOpenChange={setSingleMessageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Message</DialogTitle>
            <DialogDescription>
              Send a single message using session {singleSession?.phone_number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Username or ID</Label>
              <Input
                placeholder="@username or user_id"
                value={singleUsername}
                onChange={(e) => setSingleUsername(e.target.value)}
                disabled={sendingSingle}
              />
            </div>

            <div>
              <Label>Message Content</Label>
              <Textarea
                placeholder="Your message here..."
                value={singleContent}
                onChange={(e) => setSingleContent(e.target.value)}
                rows={4}
                disabled={sendingSingle}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setSingleMessageOpen(false)}
                disabled={sendingSingle}
              >
                Cancel
              </Button>
              <Button onClick={handleSendSingleMessage} disabled={sendingSingle} className="gap-2">
                {sendingSingle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Message Dialog */}
      <Dialog open={bulkMessageOpen} onOpenChange={setBulkMessageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Send Message</DialogTitle>
            <DialogDescription>Send messages using {selectedSessions.size} selected session(s)</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Usernames (one per line)</Label>
              <Textarea
                placeholder="@username1&#10;@username2&#10;user_id_123"
                value={usernames}
                onChange={(e) => setUsernames(e.target.value)}
                rows={5}
                disabled={sending}
              />
            </div>
            
            <div>
              <Label>Message Content</Label>
              <Textarea
                placeholder="Your message here..."
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={4}
                disabled={sending}
              />
            </div>

            {sending && (
              <div className="space-y-2">
                <Progress value={sendProgress} />
                <p className="text-sm text-center text-muted-foreground">
                  Sending... {Math.round(sendProgress)}%
                </p>
              </div>
            )}

            {sendReport && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="font-medium">Send Report</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="text-green-500">✓ Success: {sendReport.success}</div>
                  <div className="text-red-500">✗ Failed: {sendReport.failed}</div>
                  <div>Total: {sendReport.total}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setBulkMessageOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={handleBulkMessage} disabled={sending} className="gap-2">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Messages
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Proxy Dialog */}
      <Dialog open={editProxyOpen} onOpenChange={setEditProxyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Proxy Settings</DialogTitle>
            <DialogDescription>Update proxy for {editingSession?.phone_number}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Proxy Host</Label>
                <Input
                  placeholder="proxy.example.com"
                  value={editProxyHost}
                  onChange={(e) => setEditProxyHost(e.target.value)}
                />
              </div>
              <div>
                <Label>Proxy Port</Label>
                <Input
                  type="number"
                  placeholder="1080"
                  value={editProxyPort}
                  onChange={(e) => setEditProxyPort(e.target.value)}
                />
              </div>
              <div>
                <Label>Username</Label>
                <Input
                  placeholder="username"
                  value={editProxyUsername}
                  onChange={(e) => setEditProxyUsername(e.target.value)}
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="password"
                  value={editProxyPassword}
                  onChange={(e) => setEditProxyPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditProxyOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveProxy} disabled={savingProxy}>
                {savingProxy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sessions</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedSessions.size} session(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unread Messages Dialog */}
      <Dialog open={unreadDialogOpen} onOpenChange={setUnreadDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Unread Messages
            </DialogTitle>
            <DialogDescription>
              Session: {unreadSession?.phone_number} ({unreadSession?.telegram_name || 'Unknown'})
            </DialogDescription>
          </DialogHeader>
          
          {unreadLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : unreadMessages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No unread messages
            </div>
          ) : (
            <ScrollArea className="max-h-[400px] pr-4">
              <div className="space-y-3">
                {unreadMessages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-lg border ${replyingTo?.chat_id === msg.chat_id ? 'border-primary bg-primary/5' : 'bg-muted/50'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium text-sm text-primary">{msg.from_user_name || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">
                        {msg.date || ''}
                      </div>
                    </div>
                    <p className="text-sm mb-3 whitespace-pre-wrap bg-background/50 p-2 rounded">{msg.text}</p>
                    
                    {replyingTo?.chat_id === msg.chat_id ? (
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Type your reply..."
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          rows={2}
                          disabled={sendingReply}
                          className="text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyContent('');
                            }}
                            disabled={sendingReply}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSendReply}
                            disabled={sendingReply || !replyContent.trim()}
                            className="gap-1"
                          >
                            {sendingReply ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Send
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReplyingTo(msg);
                          setReplyContent('');
                        }}
                        className="gap-1"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Reply
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Proxy Management Dialog */}
      <ProxyManagement 
        open={addProxyOpen} 
        onOpenChange={setAddProxyOpen} 
      />
    </DashboardLayout>
  );
}
