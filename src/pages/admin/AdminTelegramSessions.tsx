import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  Loader2,
  Server,
  Check,
  X,
  Copy,
  ExternalLink,
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

  // VPS Config state
  const [vpsConfigOpen, setVpsConfigOpen] = useState(false);
  const [vpsIp, setVpsIp] = useState('');
  const [apiId, setApiId] = useState('2040');
  const [apiHash, setApiHash] = useState('b18441a1ff607e10a989891a5462e627');

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const generateDockerCompose = () => {
    return `version: '3.8'
services:
  telegram-api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - API_ID=${apiId}
      - API_HASH=${apiHash}
    restart: always`;
  };

  const generateMainPy = () => {
    return `from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession
import asyncio
import base64
import tempfile
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SendMessageRequest(BaseModel):
    session_data: str
    destination: str
    message: str
    proxy: dict = None

class ValidateSessionRequest(BaseModel):
    session_data: str
    proxy: dict = None

@app.get("/health")
async def health():
    return {"status": "ok", "message": "Telegram API Server Running"}

@app.post("/send-message")
async def send_message(request: SendMessageRequest):
    try:
        session_bytes = base64.b64decode(request.session_data)
        with tempfile.NamedTemporaryFile(suffix='.session', delete=False) as f:
            f.write(session_bytes)
            session_path = f.name.replace('.session', '')
        
        proxy = None
        if request.proxy:
            import socks
            proxy = (socks.SOCKS5, request.proxy['host'], request.proxy['port'],
                    True, request.proxy.get('username'), request.proxy.get('password'))
        
        client = TelegramClient(session_path, ${apiId}, "${apiHash}", proxy=proxy)
        await client.connect()
        
        if not await client.is_user_authorized():
            await client.disconnect()
            os.unlink(session_path + '.session')
            return {"success": False, "error": "Session expired"}
        
        await client.send_message(request.destination, request.message)
        await client.disconnect()
        os.unlink(session_path + '.session')
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/validate-session")
async def validate_session(request: ValidateSessionRequest):
    try:
        session_bytes = base64.b64decode(request.session_data)
        with tempfile.NamedTemporaryFile(suffix='.session', delete=False) as f:
            f.write(session_bytes)
            session_path = f.name.replace('.session', '')
        
        proxy = None
        if request.proxy:
            import socks
            proxy = (socks.SOCKS5, request.proxy['host'], request.proxy['port'],
                    True, request.proxy.get('username'), request.proxy.get('password'))
        
        client = TelegramClient(session_path, ${apiId}, "${apiHash}", proxy=proxy)
        await client.connect()
        
        is_authorized = await client.is_user_authorized()
        user = None
        if is_authorized:
            me = await client.get_me()
            user = {"id": me.id, "phone": me.phone, "username": me.username}
        
        await client.disconnect()
        os.unlink(session_path + '.session')
        
        return {"success": True, "authorized": is_authorized, "user": user}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)`;
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Telegram Sessions</h1>
            <p className="text-muted-foreground">Manage all Telegram sessions and VPS configuration</p>
          </div>
          <Button onClick={() => setVpsConfigOpen(true)} className="gap-2">
            <Server className="h-4 w-4" />
            VPS Setup Guide
          </Button>
        </div>

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
      </div>

      {/* VPS Setup Dialog */}
      <Dialog open={vpsConfigOpen} onOpenChange={setVpsConfigOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>VPS Setup Guide</DialogTitle>
            <DialogDescription>Complete guide to set up Python API server on VPS</DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="guide" className="space-y-4">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="guide">Setup Guide</TabsTrigger>
              <TabsTrigger value="config">API Config</TabsTrigger>
              <TabsTrigger value="code">Server Code</TabsTrigger>
            </TabsList>

            <TabsContent value="guide" className="space-y-4">
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-medium mb-2">1. Buy VPS</h4>
                  <p className="text-sm text-muted-foreground">
                    Recommended: DigitalOcean, Vultr, Hetzner ($5-10/mo)
                    <br />Specs: Ubuntu 22.04, 4GB RAM, 2 vCPU
                  </p>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-medium mb-2">2. Connect via SSH</h4>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background p-2 rounded flex-1">
                      ssh root@YOUR_VPS_IP
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard('ssh root@YOUR_VPS_IP')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-medium mb-2">3. Install Docker</h4>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background p-2 rounded flex-1 overflow-x-auto">
                      apt update && apt install -y docker.io docker-compose
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard('apt update && apt install -y docker.io docker-compose')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-medium mb-2">4. Create Project Folder</h4>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background p-2 rounded flex-1">
                      mkdir -p /root/telegram-server && cd /root/telegram-server
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard('mkdir -p /root/telegram-server && cd /root/telegram-server')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-medium mb-2">5. Start Server</h4>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-background p-2 rounded flex-1">
                      docker-compose up -d --build
                    </code>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard('docker-compose up -d --build')}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>VPS IP Address</Label>
                  <Input
                    placeholder="145.223.22.249"
                    value={vpsIp}
                    onChange={(e) => setVpsIp(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telegram API ID</Label>
                    <Input
                      value={apiId}
                      onChange={(e) => setApiId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telegram API Hash</Label>
                    <Input
                      value={apiHash}
                      onChange={(e) => setApiHash(e.target.value)}
                    />
                  </div>
                </div>

                <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Get API credentials from: <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">my.telegram.org</a>
                  </p>
                </div>

                {vpsIp && (
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <h4 className="font-medium text-green-400 mb-2">Your API URL:</h4>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-background p-2 rounded flex-1">
                        http://{vpsIp}:8000
                      </code>
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(`http://${vpsIp}:8000`)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="code" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>docker-compose.yml</Label>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(generateDockerCompose())}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    value={generateDockerCompose()}
                    readOnly
                    className="font-mono text-xs h-32"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>main.py</Label>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(generateMainPy())}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    value={generateMainPy()}
                    readOnly
                    className="font-mono text-xs h-64"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>requirements.txt</Label>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard('fastapi==0.104.1\nuvicorn==0.24.0\ntelethon==1.33.1\npysocks==1.7.1\npython-socks[asyncio]==2.4.3')}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    value={`fastapi==0.104.1
uvicorn==0.24.0
telethon==1.33.1
pysocks==1.7.1
python-socks[asyncio]==2.4.3`}
                    readOnly
                    className="font-mono text-xs h-28"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Dockerfile</Label>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(`FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 8000
CMD ["python", "main.py"]`)}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <Textarea
                    value={`FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 8000
CMD ["python", "main.py"]`}
                    readOnly
                    className="font-mono text-xs h-36"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
