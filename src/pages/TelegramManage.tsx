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
import { UsernameManagement } from '@/components/telegram/UsernameManagement';
import { MobileSessionCard } from '@/components/telegram/MobileSessionCard';
import { useIsMobile } from '@/hooks/use-mobile';
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
  Globe,
  Users,
  MessageCircle,
  Eye
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Daily message limit per session (to prevent bans)
const DAILY_MESSAGE_LIMIT = 5;

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

export default function TelegramManage() {
  const { user } = useAuth();
  const { config, loading: configLoading } = useTelegramConfig();
  const isMobile = useIsMobile();
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [addProxyOpen, setAddProxyOpen] = useState(false);
  const [addUsernameOpen, setAddUsernameOpen] = useState(false);
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

  // Bulk Sender state (from usernames table)
  const [bulkSenderOpen, setBulkSenderOpen] = useState(false);
  const [bulkSenderMessage, setBulkSenderMessage] = useState('');
  const [bulkSenderSending, setBulkSenderSending] = useState(false);
  const [bulkSenderProgress, setBulkSenderProgress] = useState(0);
  const [bulkSenderReport, setBulkSenderReport] = useState<{
    success: number;
    failed: number;
    total: number;
  } | null>(null);
  const [bulkSenderFailLogs, setBulkSenderFailLogs] = useState<{username: string; error: string}[]>([]);
  const [showFailLogsDialog, setShowFailLogsDialog] = useState(false);

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

  // Daily message counts per session (to track limits)
  const [dailyMessageCounts, setDailyMessageCounts] = useState<Record<string, number>>({});

  // Get Reply state
  const [getReplyOpen, setGetReplyOpen] = useState(false);
  const [replyGroups, setReplyGroups] = useState<ReplyGroupData[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [selectedReplyGroup, setSelectedReplyGroup] = useState<ReplyGroupData | null>(null);
  const [conversationReplyContent, setConversationReplyContent] = useState('');
  const [sendingConversationReply, setSendingConversationReply] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSessions();
      fetchDailyMessageCounts();
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

  // Fetch today's message count for all sessions
  const fetchDailyMessageCounts = async () => {
    if (!user) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: messages } = await supabase
      .from('telegram_messages')
      .select('session_id')
      .eq('user_id', user.id)
      .eq('status', 'sent')
      .gte('sent_at', today.toISOString());
    
    if (messages) {
      const counts: Record<string, number> = {};
      messages.forEach(msg => {
        if (msg.session_id) {
          counts[msg.session_id] = (counts[msg.session_id] || 0) + 1;
        }
      });
      setDailyMessageCounts(counts);
    }
  };

  // Get remaining daily quota for a session
  const getRemainingQuota = (sessionId: string) => {
    const used = dailyMessageCounts[sessionId] || 0;
    return Math.max(0, DAILY_MESSAGE_LIMIT - used);
  };

  // Fetch all replies grouped by from_user and session
  const fetchReplyGroups = async () => {
    if (!user) return;
    setLoadingReplies(true);

    // Fetch replies
    const { data: replies, error } = await supabase
      .from('telegram_replies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch replies');
      setLoadingReplies(false);
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
      // Update last reply time
      if (new Date(reply.created_at) > new Date(group.last_reply_at)) {
        group.last_reply_at = reply.created_at;
      }
    }

    setReplyGroups(Array.from(groupMap.values()));
    setLoadingReplies(false);
  };

  // Open Get Reply dialog
  const openGetReply = () => {
    setGetReplyOpen(true);
    fetchReplyGroups();
  };

  // Open conversation view
  const openConversation = (group: ReplyGroupData) => {
    setSelectedReplyGroup(group);
    setConversationReplyContent('');
    setConversationOpen(true);
  };

  // Send reply from conversation view
  const handleConversationReply = async () => {
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

    setSendingConversationReply(true);
    try {
      const data = await callVpsProxy('/send-message', {
        session_data: session.session_data,
        destination: selectedReplyGroup.from_user_id || selectedReplyGroup.from_user,
        message: conversationReplyContent.trim(),
        proxy: {
          host: session.proxy_host,
          port: session.proxy_port,
          username: session.proxy_username,
          password: session.proxy_password,
        },
      });

      if (data && (data as any).error) {
        throw new Error((data as any).error);
      }

      // Update session stats
      await supabase
        .from('telegram_sessions')
        .update({
          messages_sent: (session.messages_sent || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      toast.success(`Reply sent to @${selectedReplyGroup.from_user}`);
      setConversationReplyContent('');
      fetchReplyGroups();
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reply');
    }
    setSendingConversationReply(false);
  };
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

    // Check daily limit
    const remaining = getRemainingQuota(singleSession.id);
    if (remaining <= 0) {
      toast.error(`Daily limit reached for this session (${DAILY_MESSAGE_LIMIT}/day). Try again tomorrow.`);
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
      fetchDailyMessageCounts(); // Refresh daily counts
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

  // Bulk Sender - sends from selected sessions to available usernames (1 session = 1 unique username)
  // Each session has a daily limit of 5 messages
  const handleBulkSender = async () => {
    if (selectedSessions.size === 0) {
      toast.error('Select at least one session');
      return;
    }
    if (!bulkSenderMessage.trim()) {
      toast.error('Enter message content');
      return;
    }

    setBulkSenderSending(true);
    setBulkSenderProgress(0);
    setBulkSenderReport(null);
    setBulkSenderFailLogs([]);

    // Refresh daily counts first
    await fetchDailyMessageCounts();

    // Get selected active sessions with remaining quota
    const selectedSessionsArray = sessions.filter(s => 
      selectedSessions.has(s.id) && s.status === 'active' && getRemainingQuota(s.id) > 0
    );

    if (selectedSessionsArray.length === 0) {
      toast.error('No active sessions with remaining daily quota. Each session can send max 5 messages/day.');
      setBulkSenderSending(false);
      return;
    }

    // Fetch available usernames from database (all, not just 1000)
    let availableUsernames: { id: string; username: string }[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('telegram_usernames')
        .select('id, username')
        .eq('user_id', user?.id)
        .eq('status', 'available')
        .range(from, from + pageSize - 1);

      if (error || !data || data.length === 0) {
        hasMore = false;
      } else {
        availableUsernames = [...availableUsernames, ...data];
        from += pageSize;
        hasMore = data.length === pageSize;
      }
    }

    if (availableUsernames.length === 0) {
      toast.error('No available usernames');
      setBulkSenderSending(false);
      return;
    }

    // Each session gets 1 unique username (respecting daily limit)
    const totalToSend = Math.min(selectedSessionsArray.length, availableUsernames.length);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const failLogs: {username: string; error: string}[] = [];
    
    // Track daily counts locally during bulk send
    const localDailyCounts = { ...dailyMessageCounts };

    for (let i = 0; i < totalToSend; i++) {
      const session = selectedSessionsArray[i];
      const usernameData = availableUsernames[i];

      // Check if session still has remaining quota
      const currentCount = localDailyCounts[session.id] || 0;
      if (currentCount >= DAILY_MESSAGE_LIMIT) {
        skippedCount++;
        setBulkSenderProgress(((i + 1) / totalToSend) * 100);
        continue;
      }

      try {
        const data = await callVpsProxy('/send-message', {
          session_data: session.session_data,
          destination: usernameData.username,
          message: bulkSenderMessage.trim(),
          proxy: session.proxy_host ? {
            host: session.proxy_host,
            port: session.proxy_port,
            username: session.proxy_username,
            password: session.proxy_password,
          } : null,
        });

        if (data && (data as any).error) {
          // Mark as problem
          const errorMsg = (data as any).error;
          failLogs.push({ username: usernameData.username, error: errorMsg });
          await supabase
            .from('telegram_usernames')
            .update({ status: 'problem', error_message: errorMsg, updated_at: new Date().toISOString() })
            .eq('id', usernameData.id);
          failCount++;
        } else {
          // Mark as used
          await supabase
            .from('telegram_usernames')
            .update({ 
              status: 'used', 
              last_session_id: session.id, 
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', usernameData.id);

          // Update session stats
          await supabase
            .from('telegram_sessions')
            .update({
              messages_sent: (session.messages_sent || 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', session.id);

          // Log message
          if (user) {
            await supabase.from('telegram_messages').insert({
              user_id: user.id,
              session_id: session.id,
              destination: usernameData.username,
              message_content: bulkSenderMessage.trim(),
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
          }
          
          // Update local count
          localDailyCounts[session.id] = currentCount + 1;
          successCount++;
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Network error';
        failLogs.push({ username: usernameData.username, error: errorMsg });
        await supabase
          .from('telegram_usernames')
          .update({ status: 'problem', error_message: errorMsg, updated_at: new Date().toISOString() })
          .eq('id', usernameData.id);
        failCount++;
      }

      setBulkSenderProgress(((i + 1) / totalToSend) * 100);
    }

    setBulkSenderReport({
      success: successCount,
      failed: failCount,
      total: totalToSend,
    });
    setBulkSenderFailLogs(failLogs);

    setBulkSenderSending(false);
    fetchSessions();
    fetchDailyMessageCounts(); // Refresh daily counts
    toast.success(`Bulk send complete: ${successCount} success, ${failCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped (limit)` : ''}`);
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
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Telegram Manage</h1>
            <p className="text-sm text-muted-foreground">Manage sessions, send messages, track replies</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAddProxyOpen(true)} variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span> Proxy
            </Button>
            <Button onClick={() => setAddUsernameOpen(true)} variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Add TG</span> Username
            </Button>
            <Button onClick={() => setAddSessionOpen(true)} size="sm" className="gap-1.5 flex-1 sm:flex-none">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add</span> Session
            </Button>
            <Button onClick={openGetReply} variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30">
              <MessageCircle className="h-4 w-4" />
              Get_Reply
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="glass-card">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold">{sessions.length}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Total Sessions</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold text-green-500">
                {sessions.filter(s => s.status === 'active').length}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Active</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold text-blue-500">
                {sessions.reduce((sum, s) => sum + (s.messages_sent || 0), 0)}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Messages Sent</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-3 sm:pt-6 sm:p-6">
              <div className="text-xl sm:text-2xl font-bold text-purple-500">
                {sessions.reduce((sum, s) => sum + (s.replies_received || 0), 0)}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Replies</div>
            </CardContent>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Input
            placeholder="Search phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          
          {selectedSessions.size > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setBulkMessageOpen(true)} variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none">
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send</span> ({selectedSessions.size})
              </Button>
              <Button onClick={handleExportCSV} variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" />
              </Button>
              <Button onClick={() => setBulkSenderOpen(true)} size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700 flex-1 sm:flex-none">
                <Users className="h-4 w-4" />
                Bulk Sender
              </Button>
              <Button onClick={() => setDeleteConfirmOpen(true)} variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">({selectedSessions.size})</span>
              </Button>
            </div>
          )}
        </div>

        {/* Sessions - Mobile Cards / Desktop Table */}
        <Card className="glass-card">
          <CardContent className="p-2 sm:p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-8 sm:py-12">
                <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No sessions found. Add your first session to get started.</p>
              </div>
            ) : isMobile ? (
              // Mobile: Card View
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded-lg">
                  <Checkbox
                    checked={selectedSessions.size === filteredSessions.length && filteredSessions.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">Select All ({filteredSessions.length})</span>
                </div>
                {filteredSessions.map((session, index) => (
                  <MobileSessionCard
                    key={session.id}
                    session={session}
                    index={index + 1}
                    selected={selectedSessions.has(session.id)}
                    unreadCount={unreadCounts[session.id]}
                    dailyQuotaRemaining={getRemainingQuota(session.id)}
                    dailyLimit={DAILY_MESSAGE_LIMIT}
                    onSelect={(checked) => handleSelectSession(session.id, !!checked)}
                    onValidate={() => handleValidateSession(session)}
                    onSendMessage={() => {
                      setSingleSession(session);
                      setSingleUsername('');
                      setSingleContent('');
                      setSingleMessageOpen(true);
                    }}
                    onEditProxy={() => openEditProxy(session)}
                    onDelete={() => handleDeleteSession(session)}
                    onOpenUnread={() => openUnreadDialog(session)}
                  />
                ))}
              </div>
            ) : (
              // Desktop: Table View
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
                  {filteredSessions.map((session, index) => (
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
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{session.messages_sent || 0}</span>
                          <span className={`text-xs ${getRemainingQuota(session.id) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {getRemainingQuota(session.id)}/{DAILY_MESSAGE_LIMIT} today
                          </span>
                        </div>
                      </TableCell>
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
                  ))}
                </TableBody>
              </Table>
            )}
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
            {/* Daily Limit Warning */}
            {singleSession && (
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                getRemainingQuota(singleSession.id) > 0 
                  ? 'bg-blue-500/10 border border-blue-500/20' 
                  : 'bg-red-500/10 border border-red-500/20'
              }`}>
                <AlertCircle className={`h-4 w-4 ${getRemainingQuota(singleSession.id) > 0 ? 'text-blue-400' : 'text-red-400'}`} />
                <span>
                  Daily limit: <strong>{getRemainingQuota(singleSession.id)}/{DAILY_MESSAGE_LIMIT}</strong> remaining
                  {getRemainingQuota(singleSession.id) === 0 && ' (Try again tomorrow)'}
                </span>
              </div>
            )}
            
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
              <Button 
                onClick={handleSendSingleMessage} 
                disabled={sendingSingle || (singleSession ? getRemainingQuota(singleSession.id) <= 0 : false)} 
                className="gap-2"
              >
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

      {/* Bulk Sender Dialog - send from selected sessions to available usernames */}
      <Dialog open={bulkSenderOpen} onOpenChange={setBulkSenderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk Sender
            </DialogTitle>
            <DialogDescription>
              Send messages from {selectedSessions.size} selected session(s) to available usernames. 
              Each session sends to 1 unique username.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Daily Limit Info */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
              <div className="flex items-center gap-2 text-yellow-400 font-medium mb-1">
                <AlertCircle className="h-4 w-4" />
                Daily Limit: {DAILY_MESSAGE_LIMIT} messages/session/day
              </div>
              <p className="text-muted-foreground text-xs">
                To prevent session bans, each session can only send {DAILY_MESSAGE_LIMIT} messages to new usernames per 24 hours. 
                Replies to users who responded are unlimited.
              </p>
            </div>
            
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><strong>Selected Sessions:</strong> {selectedSessions.size}</p>
              <p className="text-green-400 text-xs mt-1">
                Sessions with quota: {sessions.filter(s => 
                  selectedSessions.has(s.id) && s.status === 'active' && getRemainingQuota(s.id) > 0
                ).length}
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Each session will message 1 unique username from your available usernames list.
              </p>
            </div>
            
            <div>
              <Label>Message Content</Label>
              <Textarea
                placeholder="Your message here..."
                value={bulkSenderMessage}
                onChange={(e) => setBulkSenderMessage(e.target.value)}
                rows={4}
                disabled={bulkSenderSending}
              />
            </div>

            {bulkSenderSending && (
              <div className="space-y-2">
                <Progress value={bulkSenderProgress} />
                <p className="text-sm text-center text-muted-foreground">
                  Sending... {Math.round(bulkSenderProgress)}%
                </p>
              </div>
            )}

            {bulkSenderReport && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="font-medium">Send Report</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="text-green-500">✓ Success: {bulkSenderReport.success}</div>
                  <div className="text-red-500">✗ Failed: {bulkSenderReport.failed}</div>
                  <div>Total: {bulkSenderReport.total}</div>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              {bulkSenderFailLogs.length > 0 && (
                <Button variant="outline" onClick={() => setShowFailLogsDialog(true)} className="gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Logs ({bulkSenderFailLogs.length})
                </Button>
              )}
              <Button variant="outline" onClick={() => setBulkSenderOpen(false)} disabled={bulkSenderSending}>
                Cancel
              </Button>
              <Button onClick={handleBulkSender} disabled={bulkSenderSending} className="gap-2 bg-purple-600 hover:bg-purple-700">
                {bulkSenderSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Start Bulk Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fail Logs Dialog */}
      <Dialog open={showFailLogsDialog} onOpenChange={setShowFailLogsDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertCircle className="h-5 w-5" />
              Failed Messages Logs ({bulkSenderFailLogs.length})
            </DialogTitle>
            <DialogDescription>
              Original error responses from failed message sends
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2">
              {bulkSenderFailLogs.map((log, index) => (
                <div key={index} className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
                  <div className="font-medium text-red-400">@{log.username}</div>
                  <div className="text-muted-foreground mt-1 break-all">{log.error}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowFailLogsDialog(false)}>
              Close
            </Button>
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

      {/* Username Management Dialog */}
      <UsernameManagement 
        open={addUsernameOpen} 
        onOpenChange={setAddUsernameOpen}
        sessions={sessions.map(s => ({
          id: s.id,
          phone_number: s.phone_number,
          telegram_name: s.telegram_name,
          status: s.status
        }))}
      />

      {/* Get Reply Dialog */}
      <Dialog open={getReplyOpen} onOpenChange={setGetReplyOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-purple-500" />
              All Replies
            </DialogTitle>
            <DialogDescription>
              View all incoming replies from Telegram users
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            {loadingReplies ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : replyGroups.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No replies found</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[55vh]">
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
                    {replyGroups.map((group, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          <span className="text-purple-400">@{group.from_user}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{group.session_name || group.session_phone}</div>
                            <div className="text-xs text-muted-foreground">{group.session_phone}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(group.last_reply_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => openConversation(group)}
                            className="gap-1.5"
                          >
                            <Eye className="h-4 w-4" />
                            View Reply ({group.reply_count})
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>

          <div className="flex justify-between items-center mt-4">
            <Button variant="outline" size="sm" onClick={fetchReplyGroups} disabled={loadingReplies}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingReplies ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setGetReplyOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Conversation View Dialog */}
      <Dialog open={conversationOpen} onOpenChange={setConversationOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-purple-500" />
              Conversation with @{selectedReplyGroup?.from_user}
            </DialogTitle>
            <DialogDescription>
              Last 10 messages • Session: {selectedReplyGroup?.session_name || selectedReplyGroup?.session_phone}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[45vh] mt-2">
            <div className="space-y-3">
              {selectedReplyGroup?.replies.map((reply, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-border bg-muted/30">
                  {/* Incoming message */}
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-purple-400 border-purple-500/30 text-xs">
                        @{selectedReplyGroup.from_user}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(reply.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm bg-purple-500/10 p-2 rounded">{reply.message_content}</p>
                  </div>

                  {/* Reply sent (if any) */}
                  {reply.replied && reply.reply_content && (
                    <div className="ml-4 mt-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-green-400 border-green-500/30 text-xs">
                          You
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {reply.replied_at ? new Date(reply.replied_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="text-sm bg-green-500/10 p-2 rounded">{reply.reply_content}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Reply Box */}
          <div className="mt-4 space-y-3">
            <Textarea
              placeholder="Type your reply..."
              value={conversationReplyContent}
              onChange={(e) => setConversationReplyContent(e.target.value)}
              rows={2}
              disabled={sendingConversationReply}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setConversationOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleConversationReply} 
                disabled={sendingConversationReply || !conversationReplyContent.trim()}
                className="gap-2"
              >
                {sendingConversationReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send Reply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
