import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
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
  Sparkles,
  FolderPlus,
  Layers,
  Send,
  Image as ImageIcon
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface PhotoServiceCategory {
  id: string;
  name: string;
  status: string;
  photo_count: number;
}

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
  batch_id: string | null;
  bio: string | null;
}

interface AccountBatch {
  id: string;
  name: string;
  user_id: string;
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
  const [batches, setBatches] = useState<AccountBatch[]>([]);
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
  
  // Batch management state
  const [selectedBatchFilter, setSelectedBatchFilter] = useState<string>('unbatched');
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Bulk photo post state
  const [bulkPostOpen, setBulkPostOpen] = useState(false);
  const [photoCategories, setPhotoCategories] = useState<PhotoServiceCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [bulkPosting, setBulkPosting] = useState(false);
  const [bulkPostProgress, setBulkPostProgress] = useState(0);
  const [bulkPostReport, setBulkPostReport] = useState<{
    success: number;
    failed: number;
    total: number;
    details: { username: string; status: 'success' | 'failed'; error?: string }[];
  } | null>(null);

  useEffect(() => {
    if (user) {
      fetchAccounts();
      fetchBatches();
    }
  }, [user]);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to fetch accounts');
    } else {
      setAccounts((data || []) as InstagramAccount[]);
    }
    setLoading(false);
  };

  const fetchBatches = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('account_batches')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBatches(data as AccountBatch[]);
    }
  };

  const handleImportCookies = async () => {
    if (!cookies.trim()) {
      toast.error('Please enter cookies');
      return;
    }

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

  // Batch management functions
  const handleSelectAccount = (accountId: string, checked: boolean) => {
    const newSelected = new Set(selectedAccounts);
    if (checked) {
      newSelected.add(accountId);
    } else {
      newSelected.delete(accountId);
    }
    setSelectedAccounts(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const filteredAccountIds = filteredAccounts.map(a => a.id);
      setSelectedAccounts(new Set(filteredAccountIds));
    } else {
      setSelectedAccounts(new Set());
    }
  };

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) {
      toast.error('Please enter a batch name');
      return;
    }

    if (selectedAccounts.size === 0) {
      toast.error('Please select at least one account');
      return;
    }

    setCreatingBatch(true);

    try {
      // Create the batch
      const { data: batchData, error: batchError } = await supabase
        .from('account_batches')
        .insert({ name: newBatchName.trim(), user_id: user?.id })
        .select()
        .single();

      if (batchError) throw batchError;

      // Update selected accounts with the batch_id
      const { error: updateError } = await supabase
        .from('instagram_accounts')
        .update({ batch_id: batchData.id })
        .in('id', Array.from(selectedAccounts));

      if (updateError) throw updateError;

      toast.success(`Batch "${newBatchName}" created with ${selectedAccounts.size} accounts`);
      setNewBatchName('');
      setBatchModalOpen(false);
      setSelectedAccounts(new Set());
      fetchAccounts();
      fetchBatches();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create batch');
    }

    setCreatingBatch(false);
  };

  // Bulk delete selected accounts
  const handleBulkDelete = async () => {
    if (selectedAccounts.size === 0) return;

    setBulkDeleting(true);

    try {
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .in('id', Array.from(selectedAccounts));

      if (error) throw error;

      toast.success(`${selectedAccounts.size} account(s) removed successfully`);
      setSelectedAccounts(new Set());
      setDeleteConfirmOpen(false);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete accounts');
    }

    setBulkDeleting(false);
  };

  // Bulk refresh selected accounts
  const handleBulkRefresh = async () => {
    if (selectedAccounts.size === 0) {
      toast.error('Please select accounts first');
      return;
    }

    setBulkRefreshing(true);
    const selectedArray = Array.from(selectedAccounts);
    let successCount = 0;
    let failCount = 0;

    toast.loading(`Refreshing ${selectedArray.length} accounts...`, { id: 'bulk-refresh' });

    for (const accountId of selectedArray) {
      try {
        const { data, error } = await supabase.functions.invoke('instagram-session-action', {
          body: { accountId, action: 'refresh' }
        });

        if (error || !data.success) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (failCount === 0) {
      toast.success(`${successCount} account(s) refreshed successfully`, { id: 'bulk-refresh' });
    } else {
      toast.warning(`${successCount} refreshed, ${failCount} failed`, { id: 'bulk-refresh' });
    }

    setSelectedAccounts(new Set());
    setBulkRefreshing(false);
    fetchAccounts();
  };

  // Fetch photo service categories
  const fetchPhotoCategories = async () => {
    const { data } = await supabase
      .from('photo_service_categories')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false });
    
    if (data) {
      setPhotoCategories(data as PhotoServiceCategory[]);
    }
  };

  // Open bulk post dialog
  const openBulkPostDialog = () => {
    if (selectedAccounts.size === 0) {
      toast.error('Please select accounts first');
      return;
    }
    fetchPhotoCategories();
    setSelectedCategoryId('');
    setBulkPostReport(null);
    setBulkPostProgress(0);
    setBulkPostOpen(true);
  };

  // Handle bulk photo post with concurrent processing
  const handleBulkPhotoPost = async () => {
    if (!selectedCategoryId) {
      toast.error('Please select a photo service category');
      return;
    }

    if (selectedAccounts.size === 0) {
      toast.error('No accounts selected');
      return;
    }

    setBulkPosting(true);
    setBulkPostProgress(0);
    setBulkPostReport(null);

    const selectedAccountsList = accounts.filter(a => selectedAccounts.has(a.id) && a.status === 'active');
    const totalAccounts = selectedAccountsList.length;
    
    if (totalAccounts === 0) {
      toast.error('No active accounts selected');
      setBulkPosting(false);
      return;
    }

    // Get unique photo URLs from the selected category (one per account)
    const { data: photoItems, error: photoError } = await supabase
      .from('photo_service_items')
      .select('id, photo_url')
      .eq('category_id', selectedCategoryId)
      .limit(totalAccounts);

    if (photoError || !photoItems || photoItems.length === 0) {
      toast.error('No photos available in this category');
      setBulkPosting(false);
      return;
    }

    if (photoItems.length < totalAccounts) {
      toast.warning(`Only ${photoItems.length} photos available. Some accounts won't receive photos.`);
    }

    const details: { username: string; status: 'success' | 'failed'; error?: string }[] = [];
    let successCount = 0;
    let failedCount = 0;
    let completedCount = 0;

    const totalToProcess = Math.min(selectedAccountsList.length, photoItems.length);
    const CONCURRENT_THREADS = 10; // Number of parallel requests

    // Create account-photo pairs
    const tasks = selectedAccountsList.slice(0, totalToProcess).map((account, index) => ({
      account,
      photoItem: photoItems[index]
    }));

    // Process a single task
    const processTask = async (task: { account: InstagramAccount; photoItem: { id: string; photo_url: string } }) => {
      const { account, photoItem } = task;
      
      try {
        const { data, error } = await supabase.functions.invoke('instagram-post-photo', {
          body: { 
            accountId: account.id,
            imageUrl: photoItem.photo_url
          }
        });

        if (error || !data.success) {
          return { 
            username: account.username, 
            status: 'failed' as const, 
            error: data?.error || error?.message || 'Unknown error',
            photoItemId: null
          };
        } else {
          return { 
            username: account.username, 
            status: 'success' as const,
            photoItemId: photoItem.id
          };
        }
      } catch (err: any) {
        return { 
          username: account.username, 
          status: 'failed' as const, 
          error: err.message || 'Unknown error',
          photoItemId: null
        };
      }
    };

    // Process tasks in batches concurrently
    for (let i = 0; i < tasks.length; i += CONCURRENT_THREADS) {
      const batch = tasks.slice(i, i + CONCURRENT_THREADS);
      
      // Execute batch in parallel
      const results = await Promise.all(batch.map(processTask));
      
      // Process results
      const successPhotoIds: string[] = [];
      
      for (const result of results) {
        completedCount++;
        if (result.status === 'success') {
          successCount++;
          if (result.photoItemId) {
            successPhotoIds.push(result.photoItemId);
          }
        } else {
          failedCount++;
        }
        details.push({ 
          username: result.username, 
          status: result.status, 
          error: result.error 
        });
      }
      
      // Bulk delete used photos
      if (successPhotoIds.length > 0) {
        await supabase
          .from('photo_service_items')
          .delete()
          .in('id', successPhotoIds);
      }

      setBulkPostProgress(Math.round((completedCount / totalToProcess) * 100));
    }

    // Set report
    setBulkPostReport({
      success: successCount,
      failed: failedCount,
      total: totalToProcess,
      details
    });

    // Refresh accounts to show updated post counts
    await fetchAccounts();
    
    setBulkPosting(false);
    toast.success(`Bulk post complete: ${successCount} success, ${failedCount} failed`);
  };

  // Filter accounts based on selected batch and search query
  const filteredAccounts = accounts.filter(account => {
    // Batch filter
    let matchesBatch = true;
    if (selectedBatchFilter === 'all') matchesBatch = true;
    else if (selectedBatchFilter === 'unbatched') matchesBatch = !account.batch_id;
    else matchesBatch = account.batch_id === selectedBatchFilter;

    // Search filter
    const matchesSearch = searchQuery.trim() === '' || 
      account.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (account.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesBatch && matchesSearch;
  });

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
            <DropdownMenuContent align="end" className="bg-popover border-border">
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
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Connected Accounts</CardTitle>
                  <CardDescription>
                    {accounts.length} of {profile?.account_limit || 2} accounts used
                  </CardDescription>
                </div>
                
                {/* Batch Controls */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <Select value={selectedBatchFilter} onValueChange={setSelectedBatchFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by batch" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="all">All Accounts</SelectItem>
                        <SelectItem value="unbatched">Unbatched</SelectItem>
                        {batches.map(batch => (
                          <SelectItem key={batch.id} value={batch.id}>
                            {batch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedAccounts.size === 0) {
                        toast.error('Please select accounts first');
                        return;
                      }
                      setBatchModalOpen(true);
                    }}
                    disabled={selectedAccounts.size === 0}
                    className="gap-2"
                  >
                    <FolderPlus className="h-4 w-4" />
                    Add to Batch ({selectedAccounts.size})
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkRefresh}
                    disabled={selectedAccounts.size === 0 || bulkRefreshing}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${bulkRefreshing ? 'animate-spin' : ''}`} />
                    Refresh ({selectedAccounts.size})
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedAccounts.size === 0) {
                        toast.error('Please select accounts first');
                        return;
                      }
                      setDeleteConfirmOpen(true);
                    }}
                    disabled={selectedAccounts.size === 0}
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove ({selectedAccounts.size})
                  </Button>

                  <Button
                    size="sm"
                    onClick={openBulkPostDialog}
                    disabled={selectedAccounts.size === 0}
                    className="gap-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                  >
                    <Send className="h-4 w-4" />
                    Go Photo Post ({selectedAccounts.size})
                  </Button>
                </div>
              </div>

              {/* Search Row */}
              <div className="flex items-center gap-3">
                <Input
                  placeholder="Search by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-[300px]"
                />
                {searchQuery && (
                  <span className="text-sm text-muted-foreground">
                    {filteredAccounts.length} results
                  </span>
                )}
              </div>
            </div>
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={filteredAccounts.length > 0 && selectedAccounts.size === filteredAccounts.length}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="w-16">Photo</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-center">Posts</TableHead>
                      <TableHead className="text-center">Followers</TableHead>
                      <TableHead className="text-center">Following</TableHead>
                      <TableHead>Bio</TableHead>
                      <TableHead className="text-center">Created</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account, index) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedAccounts.has(account.id)}
                            onCheckedChange={(checked) => handleSelectAccount(account.id, checked as boolean)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Avatar className="h-12 w-12 border border-border">
                            <AvatarImage 
                              src={account.profile_pic_url 
                                ? `https://iilyhckcapcsoidabspp.supabase.co/functions/v1/proxy-image?url=${encodeURIComponent(account.profile_pic_url)}`
                                : ''
                              } 
                            />
                            <AvatarFallback className="bg-pink-500/10 text-pink-500">
                              {account.username?.[0]?.toUpperCase() || 'I'}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">@{account.username}</p>
                            <p className="text-sm text-muted-foreground">{account.full_name}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{account.posts_count.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{account.followers_count.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{account.following_count.toLocaleString()}</TableCell>
                        <TableCell className="max-w-48">
                          <p className="text-sm text-muted-foreground truncate" title={account.bio || ''}>
                            {account.bio || '-'}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm text-muted-foreground">
                            {account.created_at 
                              ? new Date(account.created_at).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })
                              : '-'}
                          </span>
                        </TableCell>
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
                            {isToday(account.created_at) && (
                              <Badge className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30">
                                <Sparkles className="h-3 w-3 mr-1" />
                                New
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

        {/* Add to Batch Modal */}
        <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5" />
                Add to Batch
              </DialogTitle>
              <DialogDescription>
                Create a new batch for {selectedAccounts.size} selected account(s)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="batch-name">Enter Your Batch Name</Label>
                <Input
                  id="batch-name"
                  placeholder="e.g., Marketing Accounts, Personal"
                  value={newBatchName}
                  onChange={(e) => setNewBatchName(e.target.value)}
                />
              </div>
              <Button 
                onClick={handleCreateBatch} 
                disabled={creatingBatch || !newBatchName.trim()}
                className="w-full"
              >
                {creatingBatch ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Confirm Batch Add'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Confirm Removal
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to remove {selectedAccounts.size} account(s)? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1"
              >
                {bulkDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Yes, Remove
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Bulk Photo Post Dialog */}
        <Dialog open={bulkPostOpen} onOpenChange={(open) => {
          if (!bulkPosting) setBulkPostOpen(open);
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-pink-500" />
                Bulk Photo Post
              </DialogTitle>
              <DialogDescription>
                Post photos to {selectedAccounts.size} selected account(s) using unique photos from a photo service
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!bulkPostReport ? (
                <>
                  <div className="space-y-2">
                    <Label>Select Photo Service Category</Label>
                    {photoCategories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No available photo services found</p>
                    ) : (
                      <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a category..." />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {photoCategories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>
                              <div className="flex items-center gap-2">
                                <ImageIcon className="h-4 w-4" />
                                <span>{cat.name}</span>
                                <span className="text-muted-foreground">({cat.photo_count} photos)</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {bulkPosting && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Posting to accounts...</span>
                        <span>{bulkPostProgress}%</span>
                      </div>
                      <Progress value={bulkPostProgress} className="h-2" />
                    </div>
                  )}

                  <Button 
                    onClick={handleBulkPhotoPost}
                    disabled={bulkPosting || !selectedCategoryId}
                    className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                  >
                    {bulkPosting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Start Go
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Report Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{bulkPostReport.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-green-500">{bulkPostReport.success}</p>
                      <p className="text-xs text-muted-foreground">Success</p>
                    </div>
                    <div className="text-center p-3 bg-red-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-red-500">{bulkPostReport.failed}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {bulkPostReport.details.map((detail, idx) => (
                      <div 
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                          detail.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}
                      >
                        <span className="font-medium">@{detail.username}</span>
                        <div className="flex items-center gap-2">
                          {detail.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <>
                              <span className="text-xs text-red-400 max-w-32 truncate">{detail.error}</span>
                              <XCircle className="h-4 w-4 text-red-500" />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button 
                    onClick={() => {
                      setBulkPostOpen(false);
                      setSelectedAccounts(new Set());
                    }}
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
