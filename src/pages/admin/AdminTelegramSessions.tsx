import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AdminTelegramConfig } from '@/components/telegram/AdminTelegramConfig';
import { 
  Loader2,
  Check,
  X,
  MessageSquare,
  Users,
  Settings
} from 'lucide-react';

interface TelegramSession {
  id: string;
  phone_number: string;
  session_name: string | null;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
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
                      <TableHead>Status</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead>Messages</TableHead>
                      <TableHead>Replies</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : filteredSessions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No sessions found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSessions.map((session, index) => (
                        <TableRow key={session.id}>
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
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(session.created_at).toLocaleDateString()}
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
      </div>
    </AdminLayout>
  );
}
