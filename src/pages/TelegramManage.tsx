import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Eye,
  Filter,
  FolderPlus,
  Tag
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

// Daily message limit per session (to prevent bans)
const DAILY_MESSAGE_LIMIT = 5;

// Cooldown period in minutes after sending a message
const COOLDOWN_MINUTES = 10;

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
  filter_id: string | null;
}

interface SessionFilter {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
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
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [addProxyOpen, setAddProxyOpen] = useState(false);
  const [addUsernameOpen, setAddUsernameOpen] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter system state
  const [filters, setFilters] = useState<SessionFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [createFilterOpen, setCreateFilterOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [creatingFilter, setCreatingFilter] = useState(false);
  const [moveToFilterOpen, setMoveToFilterOpen] = useState(false);
  const [selectedMoveFilterId, setSelectedMoveFilterId] = useState<string>('');

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
  
  // Cooldown refresh trigger
  const [cooldownTick, setCooldownTick] = useState(0);
  
  useEffect(() => {
    if (user) {
      fetchSessions();
      fetchFilters();
      fetchDailyMessageCounts();
    }
  }, [user]);
  
  // Refresh cooldown display every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCooldownTick(t => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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

  // Fetch filters
  const fetchFilters = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('telegram_session_filters')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      setFilters(data as SessionFilter[]);
    }
  };

  // Create new filter and assign selected sessions
  const handleCreateFilter = async () => {
    if (!user || !newFilterName.trim()) {
      toast.error('Enter filter name');
      return;
    }
    
    setCreatingFilter(true);
    try {
      // Create the filter
      const { data: newFilter, error: createError } = await supabase
        .from('telegram_session_filters')
        .insert({ user_id: user.id, name: newFilterName.trim() })
        .select()
        .single();
      
      if (createError) throw createError;
      
      // Move selected sessions to this filter
      if (selectedSessions.size > 0) {
        const { error: updateError } = await supabase
          .from('telegram_sessions')
          .update({ filter_id: newFilter.id })
          .in('id', Array.from(selectedSessions));
        
        if (updateError) throw updateError;
      }
      
      toast.success(`Filter "${newFilterName}" created with ${selectedSessions.size} session(s)`);
      setNewFilterName('');
      setCreateFilterOpen(false);
      setSelectedSessions(new Set());
      fetchSessions();
      fetchFilters();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create filter');
    }
    setCreatingFilter(false);
  };

  // Move selected sessions to an existing filter
  const handleMoveToFilter = async () => {
    if (!selectedMoveFilterId || selectedSessions.size === 0) return;
    
    try {
      const { error } = await supabase
        .from('telegram_sessions')
        .update({ filter_id: selectedMoveFilterId === 'none' ? null : selectedMoveFilterId })
        .in('id', Array.from(selectedSessions));
      
      if (error) throw error;
      
      const filterName = selectedMoveFilterId === 'none' 
        ? 'Unfiltered' 
        : filters.find(f => f.id === selectedMoveFilterId)?.name;
      toast.success(`${selectedSessions.size} session(s) moved to "${filterName}"`);
      setMoveToFilterOpen(false);
      setSelectedMoveFilterId('');
      setSelectedSessions(new Set());
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to move sessions');
    }
  };

  // Delete a filter (sessions go back to unfiltered)
  const handleDeleteFilter = async (filterId: string) => {
    if (!confirm('Delete this filter? Sessions will become unfiltered.')) return;
    
    try {
      const { error } = await supabase
        .from('telegram_session_filters')
        .delete()
        .eq('id', filterId);
      
      if (error) throw error;
      
      if (activeFilterId === filterId) {
        setActiveFilterId(null);
      }
      toast.success('Filter deleted');
      fetchFilters();
      fetchSessions();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete filter');
    }
  };
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

  // Check if session is in cooldown (used within last 10 minutes)
  const isSessionInCooldown = (session: TelegramSession) => {
    if (!session.last_used_at) return false;
    const lastUsed = new Date(session.last_used_at).getTime();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
    return Date.now() - lastUsed < cooldownMs;
  };

  // Get remaining cooldown time in minutes
  const getCooldownRemaining = (session: TelegramSession) => {
    if (!session.last_used_at) return 0;
    const lastUsed = new Date(session.last_used_at).getTime();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;
    const remaining = cooldownMs - (Date.now() - lastUsed);
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / 60000); // Return minutes
  };


  const handleSelectSession = (sessionId: string, checked: boolean) => {
    const session = sessions.find(s => s.id === sessionId);
    // Don't allow selecting sessions in cooldown
    if (session && isSessionInCooldown(session)) {
      toast.error(`Session in cooldown. Wait ${getCooldownRemaining(session)} min.`);
      return;
    }
    // Don't allow selecting sessions with daily limit reached
    if (session && getRemainingQuota(session.id) <= 0) {
      toast.error('Daily limit reached (0/5). Try again in 24 hours.');
      return;
    }
    
    const newSelected = new Set(selectedSessions);
    if (checked) {
      newSelected.add(sessionId);
    } else {
      newSelected.delete(sessionId);
    }
    setSelectedSessions(newSelected);
  };

  // Helper to check if session is selectable (not in cooldown and has quota)
  const isSessionSelectable = (session: TelegramSession) => {
    return !isSessionInCooldown(session) && getRemainingQuota(session.id) > 0;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Only select sessions that are NOT in cooldown and have remaining quota
      const selectableSessions = filteredSessions.filter(s => isSessionSelectable(s));
      setSelectedSessions(new Set(selectableSessions.map(s => s.id)));
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

    // Get selected active sessions with remaining quota AND not in cooldown
    const selectedSessionsArray = sessions.filter(s => 
      selectedSessions.has(s.id) && s.status === 'active' && getRemainingQuota(s.id) > 0 && !isSessionInCooldown(s)
    );

    if (selectedSessionsArray.length === 0) {
      toast.error('No active sessions available. Sessions may be in cooldown (10 min) or daily limit reached.');
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

  // Filter sessions by active filter and search query
  const filteredSessions = sessions.filter(session => {
    // First apply filter_id filter
    if (activeFilterId === 'unfiltered') {
      if (session.filter_id !== null) return false;
    } else if (activeFilterId) {
      if (session.filter_id !== activeFilterId) return false;
    }
    
    // Then apply search
    if (!searchQuery) return true;
    return session.phone_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
           session.session_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           session.telegram_name?.toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  // Get count for each filter
  const getFilterCount = (filterId: string | null) => {
    if (filterId === 'unfiltered') {
      return sessions.filter(s => s.filter_id === null).length;
    }
    return sessions.filter(s => s.filter_id === filterId).length;
  };

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
            <Button onClick={() => navigate('/telegram-replies')} variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30">
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

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeFilterId === null ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilterId(null)}
            className="gap-1.5"
          >
            <Filter className="h-4 w-4" />
            All ({sessions.length})
          </Button>
          <Button
            variant={activeFilterId === 'unfiltered' ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilterId('unfiltered')}
            className="gap-1.5"
          >
            Unfiltered ({getFilterCount('unfiltered')})
          </Button>
          {filters.map(filter => (
            <Button
              key={filter.id}
              variant={activeFilterId === filter.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilterId(filter.id)}
              className="gap-1.5 group"
            >
              <Tag className="h-3 w-3" />
              {filter.name} ({getFilterCount(filter.id)})
              <span 
                className="ml-1 text-destructive opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={(e) => { e.stopPropagation(); handleDeleteFilter(filter.id); }}
              >
                ×
              </span>
            </Button>
          ))}
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Input
            placeholder="Search phone/name..."
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
              <Button onClick={() => setCreateFilterOpen(true)} size="sm" variant="outline" className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                <FolderPlus className="h-4 w-4" />
                Create Filter
              </Button>
              {filters.length > 0 && (
                <Button onClick={() => setMoveToFilterOpen(true)} size="sm" variant="outline" className="gap-1.5 border-green-500/30 text-green-400 hover:bg-green-500/10">
                  <Tag className="h-4 w-4" />
                  Move to Filter
                </Button>
              )}
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
                    isInCooldown={isSessionInCooldown(session)}
                    cooldownRemaining={getCooldownRemaining(session)}
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
                        checked={selectedSessions.size > 0 && selectedSessions.size === filteredSessions.filter(s => isSessionSelectable(s)).length}
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
                          disabled={!isSessionSelectable(session)}
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
                          {isSessionInCooldown(session) ? (
                            <span className="text-xs text-yellow-400">
                              ⏳ {getCooldownRemaining(session)}m cooldown
                            </span>
                          ) : (
                            <span className={`text-xs ${getRemainingQuota(session.id) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {getRemainingQuota(session.id)}/{DAILY_MESSAGE_LIMIT} today
                            </span>
                          )}
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
                            className="text-cyan-400"
                            onClick={() => {
                              const blob = new Blob([session.session_data], { type: 'application/octet-stream' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              const filename = session.session_name || session.phone_number;
                              a.download = `${filename}.session`;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                              toast.success('Session backup downloaded');
                            }}
                            title="Download Session Backup"
                          >
                            <Download className="h-4 w-4" />
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

      {/* Create Filter Dialog */}
      <Dialog open={createFilterOpen} onOpenChange={setCreateFilterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Create Filter
            </DialogTitle>
            <DialogDescription>
              Create a new filter and add {selectedSessions.size} selected session(s) to it
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Filter Name</Label>
              <Input
                placeholder="e.g., VIP Sessions, Test Group"
                value={newFilterName}
                onChange={(e) => setNewFilterName(e.target.value)}
                disabled={creatingFilter}
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCreateFilterOpen(false)} disabled={creatingFilter}>
                Cancel
              </Button>
              <Button onClick={handleCreateFilter} disabled={creatingFilter || !newFilterName.trim()} className="gap-2">
                {creatingFilter ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to Filter Dialog */}
      <Dialog open={moveToFilterOpen} onOpenChange={setMoveToFilterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Move to Filter
            </DialogTitle>
            <DialogDescription>
              Move {selectedSessions.size} selected session(s) to an existing filter
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Select Filter</Label>
              <Select value={selectedMoveFilterId} onValueChange={setSelectedMoveFilterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a filter..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unfiltered (Remove from filter)</SelectItem>
                  {filters.map(filter => (
                    <SelectItem key={filter.id} value={filter.id}>
                      {filter.name} ({getFilterCount(filter.id)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setMoveToFilterOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleMoveToFilter} disabled={!selectedMoveFilterId} className="gap-2">
                <Tag className="h-4 w-4" />
                Move
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
