import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BulkImportDialog } from '@/components/instagram/BulkImportDialog';
import { 
  Plus, 
  RefreshCw, 
  Trash2, 
  ImagePlus, 
  Link as LinkIcon, 
  Upload,
  Instagram,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';

interface InstagramAccount {
  id: string;
  username: string;
  full_name: string | null;
  profile_pic_url: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  status: 'active' | 'expired' | 'pending';
  cookies: string;
  created_at: string | null;
}

const isToday = (dateString: string | null): boolean => {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

export default function InstagramManage() {
  const { user, profile } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<InstagramAccount | null>(null);
  const [cookies, setCookies] = useState('');
  const [importing, setImporting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postMode, setPostMode] = useState<'file' | 'url'>('file');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch accounts');
    } else {
      setAccounts((data || []) as InstagramAccount[]);
    }
    setLoading(false);
  };

  const handleImportCookies = async () => {
    if (!cookies.trim()) {
      toast.error('Please enter cookies');
      return;
    }

    // account_limit null means unlimited (premium)
    if (profile && profile.account_limit !== null && accounts.length >= profile.account_limit) {
      toast.error(`Account limit reached (${profile.account_limit}). Upgrade to add more.`);
      return;
    }

    setImporting(true);

    try {
      const { data, error } = await supabase.functions.invoke('import-instagram-session', {
        body: { cookies: cookies.trim() }
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Instagram account connected successfully!');
        setCookies('');
        setImportOpen(false);
        fetchAccounts();
      } else {
        toast.error(data.error || 'Failed to validate cookies');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to import session');
    }

    setImporting(false);
  };

  const handleRefreshAccount = async (account: InstagramAccount) => {
    toast.loading('Refreshing account...', { id: 'refresh' });

    try {
      const { data, error } = await supabase.functions.invoke('instagram-session-action', {
        body: { accountId: account.id, action: 'refresh' }
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Account refreshed!', { id: 'refresh' });
        fetchAccounts();
      } else {
        toast.error(data.error || 'Failed to refresh', { id: 'refresh' });
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to refresh account', { id: 'refresh' });
    }
  };

  const handleDeleteAccount = async (account: InstagramAccount) => {
    if (!confirm('Are you sure you want to remove this account?')) return;

    const { error } = await supabase
      .from('instagram_accounts')
      .delete()
      .eq('id', account.id);

    if (error) {
      toast.error('Failed to delete account');
    } else {
      toast.success('Account removed');
      fetchAccounts();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleUrlChange = (url: string) => {
    setImageUrl(url);
    setImagePreview(url);
  };

  const handlePost = async () => {
    if (!selectedAccount) return;

    const imageSource = postMode === 'file' ? imageFile : imageUrl;
    if (!imageSource) {
      toast.error('Please select an image');
      return;
    }

    setPosting(true);

    try {
      let imageData = imageUrl;
      
      if (postMode === 'file' && imageFile) {
        const reader = new FileReader();
        imageData = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(imageFile);
        });
      }

      const { data, error } = await supabase.functions.invoke('instagram-post-photo', {
        body: { 
          accountId: selectedAccount.id,
          imageData,
          imageUrl: postMode === 'url' ? imageUrl : undefined
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Photo posted successfully!');
        setPostOpen(false);
        setImageFile(null);
        setImageUrl('');
        setImagePreview('');
        fetchAccounts();
      } else {
        toast.error(data.error || 'Failed to post photo');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to post photo');
    }

    setPosting(false);
  };

  const openPostDialog = (account: InstagramAccount) => {
    setSelectedAccount(account);
    setPostOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Instagram className="h-7 w-7 text-pink-500" />
              Instagram Manage
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your connected Instagram accounts
            </p>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Account
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Single Add Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkImportOpen(true)} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Bulk Add Account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect Instagram Account</DialogTitle>
                <DialogDescription>
                  Paste your Instagram session cookies to connect your account
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="cookies">Session Cookies</Label>
                  <Textarea
                    id="cookies"
                    placeholder="sessionid=xxx; ds_user_id=xxx; csrftoken=xxx;"
                    value={cookies}
                    onChange={(e) => setCookies(e.target.value)}
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Required cookies: sessionid, ds_user_id, csrftoken
                  </p>
                </div>
                <Button 
                  onClick={handleImportCookies} 
                  disabled={importing}
                  className="w-full"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Account'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Accounts Table */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Connected Accounts</CardTitle>
            <CardDescription>
              {accounts.length} of {profile?.account_limit || 2} accounts used
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12">
                <Instagram className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No accounts connected yet</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setImportOpen(true)}
                >
                  Add your first account
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-center">Posts</TableHead>
                      <TableHead className="text-center">Followers</TableHead>
                      <TableHead className="text-center">Following</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account, index) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border border-border">
                              <AvatarImage src={account.profile_pic_url || ''} />
                              <AvatarFallback className="bg-pink-500/10 text-pink-500">
                                {account.username?.[0]?.toUpperCase() || 'I'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">@{account.username}</p>
                              <p className="text-sm text-muted-foreground">{account.full_name}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{account.posts_count.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{account.followers_count.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{account.following_count.toLocaleString()}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Badge 
                              variant={account.status === 'active' ? 'default' : 'destructive'}
                              className={account.status === 'active' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : ''}
                            >
                              {account.status === 'active' ? (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                              ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              {account.status}
                            </Badge>
                            {isToday(account.created_at) ? (
                              <Badge className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
                                <Sparkles className="h-3 w-3 mr-1" />
                                New
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Regular
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPostDialog(account)}
                              disabled={account.status !== 'active'}
                            >
                              <ImagePlus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRefreshAccount(account)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteAccount(account)}
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Import Dialog */}
        <BulkImportDialog
          open={bulkImportOpen}
          onOpenChange={setBulkImportOpen}
          onComplete={fetchAccounts}
          accountLimit={profile?.account_limit ?? null}
          currentAccountCount={accounts.length}
        />

        {/* Post Dialog */}
        <Dialog open={postOpen} onOpenChange={setPostOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Photo Post</DialogTitle>
              <DialogDescription>
                Post a new photo to @{selectedAccount?.username}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Tabs value={postMode} onValueChange={(v) => setPostMode(v as 'file' | 'url')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file" className="gap-2">
                    <Upload className="h-4 w-4" />
                    Upload File
                  </TabsTrigger>
                  <TabsTrigger value="url" className="gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Image URL
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="file" className="mt-4">
                  <div 
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => document.getElementById('image-upload')?.click()}
                  >
                    {imagePreview && postMode === 'file' ? (
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="max-h-48 mx-auto rounded-lg"
                      />
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Click to select image (max 10MB)
                        </p>
                      </>
                    )}
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="url" className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="image-url">Image URL</Label>
                    <Input
                      id="image-url"
                      placeholder="https://example.com/image.jpg"
                      value={imageUrl}
                      onChange={(e) => handleUrlChange(e.target.value)}
                    />
                  </div>
                  {imagePreview && postMode === 'url' && (
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="max-h-48 mx-auto rounded-lg"
                      onError={() => setImagePreview('')}
                    />
                  )}
                </TabsContent>
              </Tabs>

              <Button 
                onClick={handlePost} 
                disabled={posting || (!imageFile && !imageUrl)}
                className="w-full"
              >
                {posting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  'Post to Instagram'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
