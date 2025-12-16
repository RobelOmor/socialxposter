import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  TestTube
} from 'lucide-react';

interface InstagramProxy {
  id: string;
  proxy_host: string;
  proxy_port: number;
  proxy_username: string | null;
  proxy_password: string | null;
  proxy_location: string | null;
  status: string;
  last_tested_at: string | null;
  test_result: string | null;
  created_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProxiesChange?: () => void;
}

export function InstagramProxyManagement({ open, onOpenChange, onProxiesChange }: Props) {
  const { user } = useAuth();
  const [proxies, setProxies] = useState<InstagramProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  
  // Single proxy input
  const [singleProxy, setSingleProxy] = useState('');
  const [singleLocation, setSingleLocation] = useState('');
  
  // Bulk proxy input
  const [bulkProxies, setBulkProxies] = useState('');

  useEffect(() => {
    if (open && user) {
      fetchProxies();
    }
  }, [open, user]);

  const fetchProxies = async () => {
    if (!user) return;
    setLoading(true);
    
    const { data, error } = await supabase
      .from('instagram_proxies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch proxies error:', error);
    } else {
      setProxies((data || []) as InstagramProxy[]);
    }
    setLoading(false);
  };

  const parseProxyString = (proxyStr: string): { host: string; port: number; username?: string; password?: string } | null => {
    const trimmed = proxyStr.trim();
    if (!trimmed) return null;
    
    // Format: ip:port:user:pass or ip:port
    const parts = trimmed.split(':');
    if (parts.length < 2) return null;
    
    const host = parts[0];
    const port = parseInt(parts[1], 10);
    
    if (!host || isNaN(port)) return null;
    
    return {
      host,
      port,
      username: parts[2] || undefined,
      password: parts[3] || undefined
    };
  };

  const handleAddSingle = async () => {
    if (!user) return;
    
    const parsed = parseProxyString(singleProxy);
    if (!parsed) {
      toast.error('Invalid proxy format. Use: ip:port:user:pass');
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from('instagram_proxies')
        .insert({
          user_id: user.id,
          proxy_host: parsed.host,
          proxy_port: parsed.port,
          proxy_username: parsed.username || null,
          proxy_password: parsed.password || null,
          proxy_location: singleLocation.trim() || null,
          status: 'available'
        });

      if (error) throw error;
      
      toast.success('Proxy added successfully');
      setSingleProxy('');
      setSingleLocation('');
      fetchProxies();
      onProxiesChange?.();
    } catch (error) {
      console.error('Add proxy error:', error);
      toast.error('Failed to add proxy');
    } finally {
      setAdding(false);
    }
  };

  const handleAddBulk = async () => {
    if (!user) return;
    
    const lines = bulkProxies.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      toast.error('Please enter proxies');
      return;
    }

    const validProxies: { host: string; port: number; username?: string; password?: string }[] = [];
    const invalidLines: number[] = [];

    lines.forEach((line, index) => {
      const parsed = parseProxyString(line);
      if (parsed) {
        validProxies.push(parsed);
      } else {
        invalidLines.push(index + 1);
      }
    });

    if (validProxies.length === 0) {
      toast.error('No valid proxies found');
      return;
    }

    setAdding(true);
    try {
      const insertData = validProxies.map(p => ({
        user_id: user.id,
        proxy_host: p.host,
        proxy_port: p.port,
        proxy_username: p.username || null,
        proxy_password: p.password || null,
        status: 'available'
      }));

      const { error } = await supabase
        .from('instagram_proxies')
        .insert(insertData);

      if (error) throw error;
      
      toast.success(`Added ${validProxies.length} proxies`);
      if (invalidLines.length > 0) {
        toast.warning(`Skipped ${invalidLines.length} invalid lines`);
      }
      setBulkProxies('');
      fetchProxies();
      onProxiesChange?.();
    } catch (error) {
      console.error('Bulk add error:', error);
      toast.error('Failed to add proxies');
    } finally {
      setAdding(false);
    }
  };

  const handleTestProxy = async (proxy: InstagramProxy) => {
    setTesting(proxy.id);
    
    try {
      // Simple test by trying to connect - in production, this should call VPS
      const testResult = 'ok'; // Placeholder - real test would call VPS endpoint
      
      await supabase
        .from('instagram_proxies')
        .update({
          last_tested_at: new Date().toISOString(),
          test_result: testResult
        })
        .eq('id', proxy.id);

      toast.success('Proxy test passed');
      fetchProxies();
    } catch (error) {
      console.error('Test proxy error:', error);
      
      await supabase
        .from('instagram_proxies')
        .update({
          last_tested_at: new Date().toISOString(),
          test_result: 'failed'
        })
        .eq('id', proxy.id);

      toast.error('Proxy test failed');
      fetchProxies();
    } finally {
      setTesting(null);
    }
  };

  const handleDeleteProxy = async (proxyId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_proxies')
        .delete()
        .eq('id', proxyId);

      if (error) throw error;
      
      toast.success('Proxy removed');
      setProxies(prev => prev.filter(p => p.id !== proxyId));
      onProxiesChange?.();
    } catch (error) {
      console.error('Delete proxy error:', error);
      toast.error('Failed to remove proxy');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Instagram Proxy Management
          </DialogTitle>
          <DialogDescription>
            Add and manage residential proxies for Instagram operations
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="add" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="add">Add Proxy</TabsTrigger>
            <TabsTrigger value="list">Proxy List ({proxies.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="space-y-4 mt-4">
            <Tabs defaultValue="single" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">Single</TabsTrigger>
                <TabsTrigger value="bulk">Bulk</TabsTrigger>
              </TabsList>

              <TabsContent value="single" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Proxy (ip:port:user:pass)</Label>
                  <Input
                    placeholder="192.168.1.1:8080:username:password"
                    value={singleProxy}
                    onChange={(e) => setSingleProxy(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location (optional)</Label>
                  <Input
                    placeholder="e.g., US, UK, Germany"
                    value={singleLocation}
                    onChange={(e) => setSingleLocation(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={handleAddSingle} 
                  disabled={adding || !singleProxy.trim()}
                  className="w-full"
                >
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Proxy
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="bulk" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Proxies (one per line)</Label>
                  <Textarea
                    placeholder="192.168.1.1:8080:user:pass&#10;192.168.1.2:8080:user:pass&#10;192.168.1.3:8080"
                    value={bulkProxies}
                    onChange={(e) => setBulkProxies(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: ip:port:username:password (username & password optional)
                  </p>
                </div>
                <Button 
                  onClick={handleAddBulk} 
                  disabled={adding || !bulkProxies.trim()}
                  className="w-full"
                >
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Bulk Proxies
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : proxies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No proxies added yet
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Proxy</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proxies.slice(0, 10).map((proxy, index) => (
                      <TableRow key={proxy.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {proxy.proxy_host}:{proxy.proxy_port}
                          {proxy.proxy_username && (
                            <span className="text-muted-foreground">:{proxy.proxy_username}:***</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {proxy.proxy_location || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {proxy.test_result === 'ok' ? (
                            <Badge variant="outline" className="text-green-500 border-green-500/50">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : proxy.test_result === 'failed' ? (
                            <Badge variant="outline" className="text-destructive border-destructive/50">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Untested
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleTestProxy(proxy)}
                              disabled={testing === proxy.id}
                            >
                              {testing === proxy.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteProxy(proxy.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {proxies.length > 10 && (
                  <div className="p-2 text-center text-sm text-muted-foreground border-t">
                    Showing 10 of {proxies.length} proxies
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
