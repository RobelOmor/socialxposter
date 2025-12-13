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
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Plus, 
  RefreshCw, 
  Trash2, 
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Send,
  Download,
  Pencil,
  Server,
  Check,
  X,
  Copy,
  ExternalLink,
  MessageSquare
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface TelegramSession {
  id: string;
  phone_number: string;
  session_name: string | null;
  session_data: string;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_username: string | null;
  proxy_password: string | null;
  messages_sent: number | null;
  replies_received: number | null;
  created_at: string;
  last_used_at: string | null;
}

export default function TelegramManage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  // API Config state
  const [pythonApiUrl, setPythonApiUrl] = useState(() => 
    localStorage.getItem('telegram_python_api_url') || ''
  );
  const [isChecking, setIsChecking] = useState(false);
  const [apiStatus, setApiStatus] = useState<"unknown" | "online" | "offline">("unknown");

  // Upload form state
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [proxyUsername, setProxyUsername] = useState('');
  const [proxyPassword, setProxyPassword] = useState('');

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

  // API Config handlers
  const handleApiUrlChange = (url: string) => {
    setPythonApiUrl(url);
    localStorage.setItem('telegram_python_api_url', url);
    setApiStatus('unknown');
  };

  const handleCheckConnection = async () => {
    if (!pythonApiUrl) {
      toast.error('Enter API URL first');
      return;
    }

    setIsChecking(true);
    try {
      const response = await fetch(`${pythonApiUrl}/health`, {
        method: "GET",
        mode: "cors",
      });

      if (response.ok) {
        setApiStatus("online");
        toast.success("Python API is online");
      } else {
        setApiStatus("offline");
        toast.error("API returned error");
      }
    } catch (error) {
      console.error("API check failed:", error);
      setApiStatus("offline");
      toast.error("Cannot connect to API");
    }
    setIsChecking(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  // File upload handler
  const handleFileUpload = async () => {
    if (!uploadFiles || uploadFiles.length === 0) {
      toast.error('Please select .session files');
      return;
    }

    if (!user) {
      toast.error('Please login first');
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      if (!file.name.endsWith('.session')) {
        failCount++;
        continue;
      }

      try {
        // Extract phone number from filename
        const phoneNumber = file.name.replace('.session', '');
        
        // Read file as base64
        const reader = new FileReader();
        const sessionData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1] || reader.result as string;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Upsert to database
        const { error } = await supabase
          .from('telegram_sessions')
          .upsert({
            user_id: user.id,
            phone_number: phoneNumber,
            session_name: file.name,
            session_data: sessionData,
            status: 'active',
            proxy_host: proxyHost || null,
            proxy_port: proxyPort ? parseInt(proxyPort) : null,
            proxy_username: proxyUsername || null,
            proxy_password: proxyPassword || null,
          }, { onConflict: 'phone_number,user_id' });

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error('Upload error:', error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} session(s) uploaded successfully`);
      setUploadOpen(false);
      setUploadFiles(null);
      setProxyHost('');
      setProxyPort('');
      setProxyUsername('');
      setProxyPassword('');
      fetchSessions();
    }
    if (failCount > 0) {
      toast.error(`${failCount} session(s) failed to upload`);
    }

    setUploading(false);
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
    if (!pythonApiUrl) {
      toast.error('Configure API URL first');
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
        const response = await fetch(`${pythonApiUrl}/send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_data: session.session_data,
            destination: username,
            message: messageContent,
            proxy: session.proxy_host ? {
              host: session.proxy_host,
              port: session.proxy_port,
              username: session.proxy_username,
              password: session.proxy_password,
            } : null,
          }),
        });

        const data = await response.json();

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Telegram Manage</h1>
            <p className="text-muted-foreground">Manage your Telegram sessions and send bulk messages</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setUploadOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Session
            </Button>
            {selectedSessions.size > 0 && (
              <>
                <Button onClick={() => setBulkMessageOpen(true)} variant="secondary" className="gap-2">
                  <Send className="h-4 w-4" />
                  Send Message ({selectedSessions.size})
                </Button>
                <Button onClick={handleExportCSV} variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button onClick={() => setDeleteConfirmOpen(true)} variant="destructive" className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Delete ({selectedSessions.size})
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sessions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="api-settings">API Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-4">
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={filteredSessions.length > 0 && selectedSessions.size === filteredSessions.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead>Messages Sent</TableHead>
                      <TableHead>Replies</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No sessions found. Add your first session.
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
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditProxy(session)}
                                title="Edit Proxy"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteSession(session)}
                                className="text-destructive hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
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
          </TabsContent>

          <TabsContent value="api-settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Python API Configuration
                </CardTitle>
                <CardDescription>Configure your VPS Python API server for Telegram operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
                  <h4 className="font-medium">📋 VPS Setup Guide</h4>
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
                  <Label>Python API URL</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="http://your-vps-ip:8000"
                      value={pythonApiUrl}
                      onChange={(e) => handleApiUrlChange(e.target.value)}
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
                  <h4 className="font-medium mb-2">🔑 Info after VPS setup:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>API URL:</strong> http://YOUR_VPS_IP:8000</li>
                    <li><strong>Proxy format:</strong> host:port:username:password (per session)</li>
                    <li><strong>Session files:</strong> .session files from Telethon/Pyrogram</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload Session Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Telegram Sessions</DialogTitle>
            <DialogDescription>Upload .session files from Telethon/Pyrogram</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Session Files (.session)</Label>
              <Input
                type="file"
                accept=".session"
                multiple
                onChange={(e) => setUploadFiles(e.target.files)}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Proxy Host</Label>
                <Input
                  placeholder="proxy.example.com"
                  value={proxyHost}
                  onChange={(e) => setProxyHost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Proxy Port</Label>
                <Input
                  placeholder="1080"
                  value={proxyPort}
                  onChange={(e) => setProxyPort(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Proxy Username</Label>
                <Input
                  placeholder="username"
                  value={proxyUsername}
                  onChange={(e) => setProxyUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Proxy Password</Label>
                <Input
                  type="password"
                  placeholder="password"
                  value={proxyPassword}
                  onChange={(e) => setProxyPassword(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={handleFileUpload} disabled={uploading} className="w-full">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Sessions
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Proxy Dialog */}
      <Dialog open={editProxyOpen} onOpenChange={setEditProxyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Proxy Settings</DialogTitle>
            <DialogDescription>Update proxy for {editingSession?.phone_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Proxy Host</Label>
                <Input
                  placeholder="proxy.example.com"
                  value={editProxyHost}
                  onChange={(e) => setEditProxyHost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Proxy Port</Label>
                <Input
                  placeholder="1080"
                  value={editProxyPort}
                  onChange={(e) => setEditProxyPort(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Proxy Username</Label>
                <Input
                  placeholder="username"
                  value={editProxyUsername}
                  onChange={(e) => setEditProxyUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Proxy Password</Label>
                <Input
                  type="password"
                  placeholder="password"
                  value={editProxyPassword}
                  onChange={(e) => setEditProxyPassword(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={handleSaveProxy} disabled={savingProxy} className="w-full">
              {savingProxy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Proxy Settings'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Message Dialog */}
      <Dialog open={bulkMessageOpen} onOpenChange={setBulkMessageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Bulk Messages</DialogTitle>
            <DialogDescription>
              Send messages to multiple users using {selectedSessions.size} selected session(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Usernames (one per line)</Label>
              <Textarea
                placeholder="username1
username2
username3"
                value={usernames}
                onChange={(e) => setUsernames(e.target.value)}
                rows={5}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Your message here..."
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                rows={3}
              />
            </div>

            {sending && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Sending...</span>
                  <span>{Math.round(sendProgress)}%</span>
                </div>
                <Progress value={sendProgress} />
              </div>
            )}

            {sendReport && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-green-400">Success: {sendReport.success}</span>
                  <span className="text-red-400">Failed: {sendReport.failed}</span>
                  <span>Total: {sendReport.total}</span>
                </div>
              </div>
            )}

            <Button 
              onClick={handleBulkMessage} 
              disabled={sending} 
              className="w-full"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Messages
                </>
              )}
            </Button>
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
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
