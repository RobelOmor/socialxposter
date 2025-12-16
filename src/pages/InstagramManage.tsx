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
import { MobileAccountCard } from '@/components/instagram/MobileAccountCard';
import { InstagramProxyManagement } from '@/components/instagram/InstagramProxyManagement';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInstagramProxies } from '@/hooks/useInstagramProxies';
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
  Sparkles,
  FolderPlus,
  Layers,
  Send,
  Image as ImageIcon,
  Download,
  Pencil,
  Globe,
  AlertTriangle,
  Clock,
  Server
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  status: 'active' | 'expired' | 'pending' | 'suspended';
  cookies: string;
  created_at: string | null;
  batch_id: string | null;
  bio: string | null;
  last_posted_at: string | null;
  posts_today: number | null;
  posts_today_date: string | null;
}

interface InstagramProxy {
  id: string;
  proxy_host: string;
  proxy_port: number;
  status: string | null;
  used_by_account_id: string | null;
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

// Safety limit constants (must match Edge Function)
const DAILY_POST_LIMIT = 3;
const COOLDOWN_MINUTES = 30;

// Check if account is in cooldown
const getAccountCooldown = (account: InstagramAccount): { inCooldown: boolean; remainingMinutes: number } => {
  if (!account.last_posted_at) return { inCooldown: false, remainingMinutes: 0 };
  
  const lastPosted = new Date(account.last_posted_at);
  const now = new Date();
  const minutesSinceLastPost = (now.getTime() - lastPosted.getTime()) / (1000 * 60);
  
  if (minutesSinceLastPost < COOLDOWN_MINUTES) {
    return { inCooldown: true, remainingMinutes: Math.ceil(COOLDOWN_MINUTES - minutesSinceLastPost) };
  }
  return { inCooldown: false, remainingMinutes: 0 };
};

// Get remaining posts today for account
const getAccountDailyRemaining = (account: InstagramAccount): number => {
  const today = new Date().toISOString().split('T')[0];
  if (account.posts_today_date !== today) return DAILY_POST_LIMIT;
  return Math.max(0, DAILY_POST_LIMIT - (account.posts_today || 0));
};

// Check if account can post
const canAccountPost = (account: InstagramAccount): boolean => {
  if (account.status !== 'active') return false;
  const cooldown = getAccountCooldown(account);
  if (cooldown.inCooldown) return false;
  if (getAccountDailyRemaining(account) <= 0) return false;
  return true;
};

type SupabaseFunctionInvokeError = {
  message?: string;
  context?: {
    status?: number;
    body?: string;
  };
};

const getInvokeErrorMeta = (error: unknown): { status?: number; body?: string } => {
  const err = error as SupabaseFunctionInvokeError | null;
  return {
    status: err?.context?.status,
    body: err?.context?.body,
  };
};

const getEdgeFunctionErrorMessage = (error: unknown, data?: any): string => {
  const candidate =
    (data?.error && String(data.error)) ||
    (data?.message && String(data.message)) ||
    undefined;

  if (candidate?.toLowerCase().includes("allowed aspect ratio")) {
    return "Image aspect ratio support kore na — 1:1 (square) ba 4:5 ratio image use korun.";
  }

  if (candidate) return candidate;

  const err = error as SupabaseFunctionInvokeError | null;
  let body = err?.context?.body;

  // Handle ReadableStream or non-string body
  if (body && typeof body !== 'string') {
    try {
      body = JSON.stringify(body);
    } catch {
      body = String(body);
    }
  }

  if (typeof body === 'string' && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      const parsedMsg =
        (parsed?.error && String(parsed.error)) ||
        (parsed?.message && String(parsed.message)) ||
        body;

      if (parsedMsg?.toLowerCase?.().includes?.("allowed aspect ratio")) {
        return "Image aspect ratio support kore na — 1:1 (square) ba 4:5 ratio image use korun.";
      }

      return parsedMsg;
    } catch {
      if (body.toLowerCase().includes("allowed aspect ratio")) {
        return "Image aspect ratio support kore na — 1:1 (square) ba 4:5 ratio image use korun.";
      }
      return body;
    }
  }

  const status = err?.context?.status;
  const msg = (err?.message && String(err.message)) || 'Unknown error';
  if (msg.toLowerCase().includes('non-2xx')) {
    return status ? `Server error (HTTP ${status}). Details Edge Function logs e thakbe.` : 'Server error. Details Edge Function logs e thakbe.';
  }

  return status ? `${msg} (HTTP ${status})` : msg;
};

export default function InstagramManage() {
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const { availableCount, totalCount, fetchProxies: refetchProxies } = useInstagramProxies();
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
    details: {
      username: string;
      status: 'success' | 'failed';
      error?: string;
      photoUrl?: string;
      statusCode?: number;
      errorBody?: string;
    }[];
  } | null>(null);
  const [bulkPostLogsOpen, setBulkPostLogsOpen] = useState(false);

  // Bio edit state
  const [bioEditOpen, setBioEditOpen] = useState(false);
  const [bioEditAccount, setBioEditAccount] = useState<InstagramAccount | null>(null);
  const [newBioText, setNewBioText] = useState('');
  const [updatingBio, setUpdatingBio] = useState(false);

  // Batch rename state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renamingBatch, setRenamingBatch] = useState<AccountBatch | null>(null);
  const [newBatchNameRename, setNewBatchNameRename] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  // Proxy management state
  const [proxyModalOpen, setProxyModalOpen] = useState(false);
  const [accountProxies, setAccountProxies] = useState<Map<string, InstagramProxy>>(new Map());

  // Link to Post state
  const [linkPostOpen, setLinkPostOpen] = useState(false);
  const [linkPostUrl, setLinkPostUrl] = useState('');
  const [linkPostPreview, setLinkPostPreview] = useState('');
  const [linkPosting, setLinkPosting] = useState(false);
  const [linkPostProgress, setLinkPostProgress] = useState(0);
  const [linkPostReport, setLinkPostReport] = useState<{
    success: number;
    failed: number;
    total: number;
    details: { username: string; status: 'success' | 'failed'; error?: string }[];
  } | null>(null);

  useEffect(() => {
    if (user) {
      fetchAccounts();
      fetchBatches();
      fetchAccountProxies();
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

  // Fetch proxies to map which account uses which proxy
  const fetchAccountProxies = async () => {
    if (!user) return;
    // Only fetch proxies that are assigned to accounts (much smaller dataset, avoids 1000 row limit)
    const { data } = await supabase
      .from('instagram_proxies')
      .select('id, proxy_host, proxy_port, status, used_by_account_id')
      .eq('user_id', user.id)
      .not('used_by_account_id', 'is', null);
    
    if (data) {
      const proxyMap = new Map<string, InstagramProxy>();
      data.forEach(proxy => {
        if (proxy.used_by_account_id) {
          proxyMap.set(proxy.used_by_account_id, proxy as InstagramProxy);
        }
      });
      setAccountProxies(proxyMap);
    }
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

      console.log('=== Import Session Response ===');
      console.log('Full Response:', JSON.stringify(data, null, 2));

      if (data.success) {
        toast.success(`Account @${data.data?.username} connected successfully!`);
        setCookies('');
        setImportOpen(false);
        fetchAccounts();
      } else if (data.duplicate) {
        toast.error(`Account @${data.data?.username} is already connected`);
      } else {
        // Show detailed error based on reason
        const errorMsg = data.error || 'Failed to validate cookies';
        const reason = data.reason;
        
        if (reason === 'suspended') {
          toast.error(`🚫 ${errorMsg}`, { duration: 5000 });
        } else if (reason === 'challenge_required') {
          toast.error(`⚠️ ${errorMsg}`, { duration: 5000 });
        } else if (reason === 'expired') {
          toast.error(`❌ ${errorMsg}`, { duration: 5000 });
        } else if (reason === 'rate_limited') {
          toast.error(`⏳ ${errorMsg}`, { duration: 5000 });
        } else {
          toast.error(errorMsg);
        }
        
        console.log('Error reason:', reason);
        console.log('Instagram response:', data.instagram_response);
      }
    } catch (error: any) {
      console.error('Import error:', error);
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

      console.log('=== Refresh Account Response ===');
      console.log('Account:', account.username);
      console.log('Full Response:', JSON.stringify(data, null, 2));
      if (error) console.log('Error:', error);

      if (error) throw error;

      if (data.success) {
        const status = (data as any)?.status as string | undefined;
        const vpsError = (data as any)?.vps_response?.error as string | undefined;
        const proxyUsed = (data as any)?.vps_response?.proxy_used as boolean | undefined;

        if (status === 'active') {
          toast.success(proxyUsed ? 'Account refreshed (proxy used)!' : 'Account refreshed!', { id: 'refresh' });
        } else if (status === 'suspended') {
          toast.error('Account is SUSPENDED!', { id: 'refresh' });
        } else if (status === 'expired') {
          toast.error(vpsError ? `Expired: ${vpsError}` : 'Session expired', {
            id: 'refresh',
            duration: 6000,
          });
        } else {
          toast.success('Account refreshed!', { id: 'refresh' });
        }

        fetchAccounts();
      } else {
        toast.error(data.error || 'Failed to refresh', { id: 'refresh' });
      }
    } catch (error: any) {
      console.log('Refresh Error:', error);
      toast.error(error.message || 'Failed to refresh account', { id: 'refresh' });
    }
  };

  const handleDeleteAccount = async (account: InstagramAccount) => {
    if (!confirm('Are you sure you want to remove this account?')) return;

    // First, delete the assigned proxy for this account
    const { error: proxyError } = await supabase
      .from('instagram_proxies')
      .delete()
      .eq('used_by_account_id', account.id);

    if (proxyError) {
      console.error('Failed to delete proxy:', proxyError);
    }

    // Then delete the account
    const { error } = await supabase
      .from('instagram_accounts')
      .delete()
      .eq('id', account.id);

    if (error) {
      toast.error('Failed to delete account');
    } else {
      toast.success('Account and proxy removed');
      fetchAccounts();
      refetchProxies();
    }
  };

  // Assign an available proxy to an account that doesn't have one
  const handleAssignProxy = async (account: InstagramAccount) => {
    if (!user) return;
    
    try {
      // Get an available proxy
      const { data: availableProxy, error: proxyError } = await supabase
        .from('instagram_proxies')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'available')
        .is('used_by_account_id', null)
        .limit(1)
        .single();

      if (proxyError || !availableProxy) {
        toast.error('No available proxy. Please add more proxies first.');
        return;
      }

      // Assign proxy to account
      const { error: updateError } = await supabase
        .from('instagram_proxies')
        .update({ 
          status: 'used',
          used_by_account_id: account.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', availableProxy.id);

      if (updateError) {
        toast.error('Failed to assign proxy');
        return;
      }

      toast.success(`Proxy assigned to @${account.username}`);
      fetchAccountProxies();
      refetchProxies();
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign proxy');
    }
  };

  // Bulk assign proxies to selected accounts that don't have one
  const handleBulkAssignProxy = async () => {
    if (selectedAccounts.size === 0 || !user) {
      toast.error('Please select accounts first');
      return;
    }

    // Filter accounts that don't have a proxy
    const accountsNeedingProxy = Array.from(selectedAccounts).filter(id => !accountProxies.has(id));
    
    if (accountsNeedingProxy.length === 0) {
      toast.info('All selected accounts already have proxies assigned');
      return;
    }

    toast.loading(`Assigning proxies to ${accountsNeedingProxy.length} accounts...`, { id: 'bulk-proxy' });

    let successCount = 0;
    let failCount = 0;

    for (const accountId of accountsNeedingProxy) {
      // Get an available proxy
      const { data: availableProxy, error: proxyError } = await supabase
        .from('instagram_proxies')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'available')
        .is('used_by_account_id', null)
        .limit(1)
        .single();

      if (proxyError || !availableProxy) {
        failCount++;
        continue;
      }

      // Assign proxy to account
      const { error: updateError } = await supabase
        .from('instagram_proxies')
        .update({ 
          status: 'used',
          used_by_account_id: accountId,
          updated_at: new Date().toISOString()
        })
        .eq('id', availableProxy.id);

      if (updateError) {
        failCount++;
      } else {
        successCount++;
      }
    }

    if (failCount === 0) {
      toast.success(`${successCount} proxies assigned successfully`, { id: 'bulk-proxy' });
    } else if (successCount === 0) {
      toast.error(`Failed to assign proxies. ${failCount} failed (no available proxies?)`, { id: 'bulk-proxy' });
    } else {
      toast.warning(`${successCount} assigned, ${failCount} failed`, { id: 'bulk-proxy' });
    }

    // Refresh all data to update Daily/Proxy column
    await fetchAccountProxies();
    refetchProxies();
    await fetchAccounts();
    setSelectedAccounts(new Set());
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
        imageData = await new Promise((resolve, reject) => {
          reader.onerror = () => reject(new Error('Failed to read image file'));
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(imageFile);
        });
      }

      const { data, error } = await supabase.functions.invoke('instagram-post-photo', {
        body: {
          accountId: selectedAccount.id,
          imageData,
          imageUrl: postMode === 'url' ? imageUrl : undefined,
        },
      });

      if (error || !data?.success) {
        toast.error(getEdgeFunctionErrorMessage(error, data));
        return;
      }

      toast.success('Photo posted successfully!');
      setPostOpen(false);
      setImageFile(null);
      setImageUrl('');
      setImagePreview('');
      fetchAccounts();
    } catch (error: unknown) {
      toast.error(getEdgeFunctionErrorMessage(error));
    } finally {
      setPosting(false);
    }
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
    if (selectedAccounts.size === 0 || !user) return;

    setBulkDeleting(true);
    const accountIds = Array.from(selectedAccounts);
    let successCount = 0;
    let failCount = 0;

    // Delete in smaller batches to avoid request size limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
      const batch = accountIds.slice(i, i + BATCH_SIZE);
      
      // First, delete proxies assigned to these accounts
      const { error: proxyError } = await supabase
        .from('instagram_proxies')
        .delete()
        .in('used_by_account_id', batch);

      if (proxyError) {
        console.error('Failed to delete proxies:', proxyError);
      }

      // Then delete the accounts
      const { error } = await supabase
        .from('instagram_accounts')
        .delete()
        .eq('user_id', user.id)
        .in('id', batch);

      if (error) {
        failCount += batch.length;
        console.error('Bulk delete error:', error);
      } else {
        successCount += batch.length;
      }
    }

    if (failCount > 0) {
      toast.error(`Failed to remove ${failCount} account(s)`);
    }
    if (successCount > 0) {
      toast.success(`${successCount} account(s) and proxies removed`);
    }
    
    setSelectedAccounts(new Set());
    setDeleteConfirmOpen(false);
    fetchAccounts();
    refetchProxies();
    setBulkDeleting(false);
  };

  // Bulk refresh selected accounts
  const handleBulkRefresh = async () => {
    if (selectedAccounts.size === 0) {
      toast.error('Please select accounts first');
      return;
    }

    setBulkRefreshing(true);
    
    // Filter accounts: only those with proxy assigned
    const selectedArray = Array.from(selectedAccounts);
    const accountsWithProxy = selectedArray.filter(id => accountProxies.has(id));
    const accountsWithoutProxy = selectedArray.length - accountsWithProxy.length;
    
    if (accountsWithProxy.length === 0) {
      toast.error('No accounts with proxy assigned. Assign proxies first.');
      setBulkRefreshing(false);
      return;
    }
    
    if (accountsWithoutProxy > 0) {
      toast.warning(`${accountsWithoutProxy} accounts skipped (no proxy)`);
    }
    
    let successCount = 0;
    let failCount = 0;
    let suspendCount = 0;

    toast.loading(`Refreshing ${accountsWithProxy.length} accounts...`, { id: 'bulk-refresh' });

    for (const accountId of accountsWithProxy) {
      try {
        const { data, error } = await supabase.functions.invoke('instagram-session-action', {
          body: { accountId, action: 'refresh' }
        });

        if (error || !data.success) {
          failCount++;
          console.log(`Refresh failed for ${accountId}:`, data?.error || error);
        } else {
          successCount++;
          
          // Check if account is suspended
          if (data.instagram_response?.is_suspended) {
            suspendCount++;
          }
        }
      } catch (err) {
        failCount++;
        console.log(`Refresh error for ${accountId}:`, err);
      }
    }

    if (suspendCount > 0) {
      toast.error(`${suspendCount} account(s) SUSPENDED!`, { id: 'bulk-refresh' });
    } else if (failCount === 0) {
      toast.success(`${successCount} account(s) refreshed`, { id: 'bulk-refresh' });
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

  // Open link post dialog
  const openLinkPostDialog = () => {
    if (selectedAccounts.size === 0) {
      toast.error('Please select accounts first');
      return;
    }
    setLinkPostUrl('');
    setLinkPostPreview('');
    setLinkPostReport(null);
    setLinkPostProgress(0);
    setLinkPostOpen(true);
  };

  // Handle link URL change with preview
  const handleLinkPostUrlChange = (url: string) => {
    setLinkPostUrl(url);
    if (url.trim()) {
      setLinkPostPreview(url);
    } else {
      setLinkPostPreview('');
    }
  };

  // Handle link post to selected accounts
  const handleLinkPost = async () => {
    if (!linkPostUrl.trim()) {
      toast.error('Please enter an image URL');
      return;
    }

    if (selectedAccounts.size === 0) {
      toast.error('No accounts selected');
      return;
    }

    setLinkPosting(true);
    setLinkPostProgress(0);
    setLinkPostReport(null);

    // Filter accounts: active + can post (not in cooldown + has daily remaining) + has proxy
    const allSelected = accounts.filter(a => selectedAccounts.has(a.id));
    const eligibleAccounts = allSelected.filter(a => canAccountPost(a) && accountProxies.has(a.id));
    const skippedNoProxy = allSelected.filter(a => !accountProxies.has(a.id));
    const skippedAccounts = allSelected.filter(a => accountProxies.has(a.id) && !canAccountPost(a));
    
    if (eligibleAccounts.length === 0) {
      if (skippedNoProxy.length > 0) {
        toast.error('No accounts with proxy assigned');
      } else {
        toast.error('No eligible accounts (check daily limits & cooldowns)');
      }
      setLinkPosting(false);
      return;
    }

    if (skippedNoProxy.length > 0) {
      toast.warning(`${skippedNoProxy.length} accounts skipped (no proxy)`);
    }
    if (skippedAccounts.length > 0) {
      toast.warning(`${skippedAccounts.length} accounts skipped (limit/cooldown)`);
    }

    const details: { username: string; status: 'success' | 'failed'; error?: string }[] = [];
    let successCount = 0;
    let failedCount = 0;
    let completedCount = 0;

    // Increased concurrent threads for faster processing (each account has unique proxy)
    const CONCURRENT_THREADS = 15;
    
    // Random delay helper (5-15 seconds between batches - faster with unique proxies)
    const randomDelay = () => new Promise(resolve => 
      setTimeout(resolve, Math.floor(Math.random() * 10000) + 5000)
    );

    // Process a single task
    const processTask = async (account: InstagramAccount) => {
      try {
        const { data, error } = await supabase.functions.invoke('instagram-post-photo', {
          body: {
            accountId: account.id,
            imageUrl: linkPostUrl.trim(),
          },
        });

        if (error || !data?.success) {
          return {
            username: account.username,
            status: 'failed' as const,
            error: getEdgeFunctionErrorMessage(error, data),
          };
        }

        return {
          username: account.username,
          status: 'success' as const,
        };
      } catch (err: unknown) {
        return {
          username: account.username,
          status: 'failed' as const,
          error: getEdgeFunctionErrorMessage(err),
        };
      }
    };

    // Process tasks in batches concurrently with delays
    const totalToProcess = eligibleAccounts.length;
    
    for (let i = 0; i < eligibleAccounts.length; i += CONCURRENT_THREADS) {
      const batch = eligibleAccounts.slice(i, i + CONCURRENT_THREADS);
      
      const results = await Promise.all(batch.map(processTask));
      
      for (const result of results) {
        completedCount++;
        if (result.status === 'success') {
          successCount++;
        } else {
          failedCount++;
        }
        details.push({ 
          username: result.username, 
          status: result.status, 
          error: result.error 
        });
      }

      setLinkPostProgress(Math.round((completedCount / totalToProcess) * 100));
      
      // Add random delay between batches (30-90 seconds) if more batches remain
      if (i + CONCURRENT_THREADS < eligibleAccounts.length) {
        await randomDelay();
      }
    }

    // Add skipped accounts to report
    for (const acc of skippedAccounts) {
      details.push({
        username: acc.username,
        status: 'failed',
        error: acc.status !== 'active' ? 'Account not active' : 
               getAccountCooldown(acc).inCooldown ? 'In cooldown' : 'Daily limit reached'
      });
      failedCount++;
    }

    setLinkPostReport({
      success: successCount,
      failed: failedCount,
      total: totalToProcess + skippedAccounts.length,
      details
    });

    await fetchAccounts();
    await fetchAccountProxies();
    
    setLinkPosting(false);
    toast.success(`Link post complete: ${successCount} success, ${failedCount} failed`);
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

    // Filter accounts: active + has proxy
    const selectedAccountsList = accounts.filter(a => 
      selectedAccounts.has(a.id) && 
      a.status === 'active' && 
      accountProxies.has(a.id)
    );
    const skippedNoProxy = accounts.filter(a => 
      selectedAccounts.has(a.id) && 
      a.status === 'active' && 
      !accountProxies.has(a.id)
    );
    const totalAccounts = selectedAccountsList.length;
    
    if (totalAccounts === 0) {
      if (skippedNoProxy.length > 0) {
        toast.error('No accounts with proxy assigned');
      } else {
        toast.error('No active accounts selected');
      }
      setBulkPosting(false);
      return;
    }

    if (skippedNoProxy.length > 0) {
      toast.warning(`${skippedNoProxy.length} accounts skipped (no proxy)`);
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

    const details: {
      username: string;
      status: 'success' | 'failed';
      error?: string;
      photoUrl?: string;
      statusCode?: number;
      errorBody?: string;
    }[] = [];
    let successCount = 0;
    let failedCount = 0;
    let completedCount = 0;

    const totalToProcess = Math.min(selectedAccountsList.length, photoItems.length);
    const CONCURRENT_THREADS = 15; // Increased for faster processing (each account has unique proxy)

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
            imageUrl: photoItem.photo_url,
          },
        });

        if (error || !data?.success) {
          const meta = getInvokeErrorMeta(error);
          return {
            username: account.username,
            status: 'failed' as const,
            error: getEdgeFunctionErrorMessage(error, data),
            statusCode: meta.status,
            errorBody: meta.body,
            photoItemId: null,
            photoUrl: photoItem.photo_url,
          };
        }

        return {
          username: account.username,
          status: 'success' as const,
          statusCode: undefined,
          errorBody: undefined,
          photoItemId: photoItem.id,
          photoUrl: photoItem.photo_url,
        };
      } catch (err: unknown) {
        const meta = getInvokeErrorMeta(err);
        return {
          username: account.username,
          status: 'failed' as const,
          error: getEdgeFunctionErrorMessage(err),
          statusCode: meta.status,
          errorBody: meta.body,
          photoItemId: null,
          photoUrl: photoItem.photo_url,
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
          error: result.error,
          photoUrl: result.photoUrl,
          statusCode: result.statusCode,
          errorBody: result.errorBody,
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

  // Handle bio edit
  const openBioEdit = (account: InstagramAccount) => {
    setBioEditAccount(account);
    setNewBioText(account.bio || '');
    setBioEditOpen(true);
  };

  const handleUpdateBio = async () => {
    if (!bioEditAccount) return;
    
    setUpdatingBio(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        'https://iilyhckcapcsoidabspp.supabase.co/functions/v1/instagram-update-bio',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            accountId: bioEditAccount.id,
            newBio: newBioText.trim(),
          }),
        }
      );

      const result = await response.json();
      console.log('Bio update response:', result);

      if (result.success) {
        toast.success('Bio updated successfully');
        // Update local state
        setAccounts(prev => prev.map(acc => 
          acc.id === bioEditAccount.id ? { ...acc, bio: newBioText.trim() } : acc
        ));
        setBioEditOpen(false);
      } else {
        if (result.reason === 'suspended') {
          toast.error('Account is suspended');
          setAccounts(prev => prev.map(acc => 
            acc.id === bioEditAccount.id ? { ...acc, status: 'suspended' } : acc
          ));
        } else if (result.reason === 'expired') {
          toast.error('Session expired, please refresh cookies');
          setAccounts(prev => prev.map(acc => 
            acc.id === bioEditAccount.id ? { ...acc, status: 'expired' } : acc
          ));
        } else {
          toast.error(result.error || 'Failed to update bio');
        }
      }
    } catch (error) {
      console.error('Bio update error:', error);
      toast.error('Failed to update bio');
    } finally {
      setUpdatingBio(false);
    }
  };

  // Handle batch rename
  const openBatchRename = (batch: AccountBatch, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingBatch(batch);
    setNewBatchNameRename(batch.name);
    setRenameModalOpen(true);
  };

  const handleRenameBatch = async () => {
    if (!renamingBatch || !newBatchNameRename.trim()) return;
    
    setSavingRename(true);
    try {
      const { error } = await supabase
        .from('account_batches')
        .update({ name: newBatchNameRename.trim() })
        .eq('id', renamingBatch.id);

      if (error) throw error;
      
      toast.success('Batch renamed successfully');
      setBatches(prev => prev.map(b => 
        b.id === renamingBatch.id ? { ...b, name: newBatchNameRename.trim() } : b
      ));
      setRenameModalOpen(false);
    } catch (error) {
      console.error('Batch rename error:', error);
      toast.error('Failed to rename batch');
    } finally {
      setSavingRename(false);
    }
  };

  // Download selected accounts as CSV
  const handleDownloadCSV = () => {
    const accountsToDownload = filteredAccounts.filter(acc => selectedAccounts.has(acc.id));
    
    if (accountsToDownload.length === 0) {
      toast.error('Please select accounts to download');
      return;
    }

    const headers = ['#', 'Username', 'Full Name', 'Posts', 'Followers', 'Following', 'Bio', 'Status', 'Submitted'];
    const csvRows = [headers.join(',')];

    accountsToDownload.forEach((acc, index) => {
      const row = [
        index + 1,
        `@${acc.username}`,
        `"${(acc.full_name || '').replace(/"/g, '""')}"`,
        acc.posts_count,
        acc.followers_count,
        acc.following_count,
        `"${(acc.bio || 'no_bio_set').replace(/"/g, '""')}"`,
        acc.status,
        acc.created_at ? new Date(acc.created_at).toLocaleDateString() : ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `instagram_accounts_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success(`Downloaded ${accountsToDownload.length} accounts`);
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
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
              <Instagram className="h-5 w-5 sm:h-7 sm:w-7 text-pink-500" />
              Instagram Manage
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your connected Instagram accounts
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={() => setProxyModalOpen(true)}
            >
              <Globe className="h-4 w-4" />
              Add Proxy
              {totalCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  <span className="text-green-400">{availableCount}</span>
                  <span className="text-muted-foreground mx-0.5">&gt;</span>
                  <span className="text-orange-400">{totalCount - availableCount}</span>
                  <span className="text-muted-foreground mx-0.5">&lt;</span>
                  <span>{totalCount}</span>
                </Badge>
              )}
            </Button>
            
            <Button 
              className="gap-2" 
              disabled={availableCount === 0}
              onClick={() => setImportOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Account
            </Button>
          </div>

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

          <InstagramProxyManagement 
            open={proxyModalOpen} 
            onOpenChange={setProxyModalOpen}
            onProxiesChange={refetchProxies}
          />
        </div>

        {/* No Proxy Warning */}
        {availableCount === 0 && (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-semibold">
              {totalCount === 0 ? 'First Add Proxy Then Start Work' : 'No available proxy. All proxies are in use.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Accounts Table */}
        <Card className="glass-card border-border/50">
          <CardHeader className="pb-4">
            {/* Title Row */}
            <div className="mb-4">
              <CardTitle className="text-lg md:text-xl font-bold">Connected Accounts</CardTitle>
              <CardDescription className="text-sm">
                {accounts.length} of {profile?.account_limit || 2} accounts used
              </CardDescription>
            </div>

            {/* Action Buttons Row - Filter first, then buttons */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-[160px] sm:w-[180px] justify-between">
                      <span className="truncate">
                        {selectedBatchFilter === 'all' ? 'All Accounts' : 
                         selectedBatchFilter === 'unbatched' ? 'Unbatched' :
                         batches.find(b => b.id === selectedBatchFilter)?.name || 'Select batch'}
                      </span>
                      <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-popover border-border w-[200px]">
                    <DropdownMenuItem onClick={() => setSelectedBatchFilter('all')}>
                      All Accounts
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSelectedBatchFilter('unbatched')}>
                      Unbatched
                    </DropdownMenuItem>
                    {batches.map(batch => (
                      <DropdownMenuItem key={batch.id} className="flex items-center justify-between p-0">
                        <button 
                          className="flex-1 text-left px-2 py-1.5"
                          onClick={() => setSelectedBatchFilter(batch.id)}
                        >
                          {batch.name}
                        </button>
                        <button
                          className="p-1.5 hover:bg-muted rounded mr-1"
                          onClick={(e) => openBatchRename(batch, e)}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                disabled={selectedAccounts.size === 0 || totalCount === 0}
                className="gap-1.5"
              >
                <FolderPlus className="h-4 w-4" />
                Batch ({selectedAccounts.size})
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkRefresh()}
                disabled={selectedAccounts.size === 0 || bulkRefreshing}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${bulkRefreshing ? 'animate-spin' : ''}`} />
                Refresh ({selectedAccounts.size})
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkAssignProxy}
                disabled={selectedAccounts.size === 0 || availableCount === 0}
                className="gap-1.5 text-blue-500 hover:text-blue-400 border-blue-500/30 hover:border-blue-500/50"
              >
                <Server className="h-4 w-4" />
                Assign Proxy ({selectedAccounts.size})
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
                disabled={selectedAccounts.size === 0 || totalCount === 0}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Remove ({selectedAccounts.size})
              </Button>

              <Button
                size="sm"
                onClick={openBulkPostDialog}
                disabled={selectedAccounts.size === 0}
                className="gap-1.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
              >
                <Send className="h-4 w-4" />
                Go Photo Post ({selectedAccounts.size})
              </Button>

              <Button
                size="sm"
                onClick={openLinkPostDialog}
                disabled={selectedAccounts.size === 0}
                className="gap-1.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
              >
                <LinkIcon className="h-4 w-4" />
                Link to Post ({selectedAccounts.size})
              </Button>
            </div>

            {/* Search Row */}
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadCSV}
                disabled={selectedAccounts.size === 0 || totalCount === 0}
                className="gap-1.5"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              {searchQuery && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {filteredAccounts.length} results
                </span>
              )}
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
                          disabled={totalCount === 0}
                        />
                      </TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="w-16">Photo</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-center">Posts</TableHead>
                      <TableHead className="text-center">Followers</TableHead>
                      <TableHead className="text-center">Following</TableHead>
                      <TableHead>Bio</TableHead>
                      <TableHead className="text-center">Daily/Proxy</TableHead>
                      <TableHead className="text-center">Submitted</TableHead>
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
                            disabled={totalCount === 0}
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
                          <button
                            onClick={() => totalCount > 0 && openBioEdit(account)}
                            className={`text-sm text-left w-full truncate transition-colors ${
                              totalCount === 0 
                                ? 'cursor-not-allowed opacity-50' 
                                : 'hover:text-primary cursor-pointer'
                            }`}
                            title={totalCount === 0 ? 'Add proxy first' : (account.bio || 'Click to add bio')}
                            disabled={totalCount === 0}
                          >
                            {account.bio ? (
                              <span className="text-muted-foreground">{account.bio}</span>
                            ) : (
                              <span className="text-muted-foreground/50 italic">no_bio_set</span>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const cooldown = getAccountCooldown(account);
                            const dailyRemaining = getAccountDailyRemaining(account);
                            const proxy = accountProxies.get(account.id);
                            
                            return (
                              <div className="space-y-1">
                                {/* Daily limit */}
                                <div className="flex items-center justify-center gap-1">
                                  <span className={`text-xs font-medium ${
                                    dailyRemaining === 0 ? 'text-red-500' : 
                                    dailyRemaining === 1 ? 'text-yellow-500' : 'text-green-500'
                                  }`}>
                                    {dailyRemaining}/{DAILY_POST_LIMIT}
                                  </span>
                                </div>
                                
                                {/* Cooldown indicator */}
                                {cooldown.inCooldown && (
                                  <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {cooldown.remainingMinutes}m
                                  </Badge>
                                )}
                                
                                {/* Proxy indicator */}
                                {proxy ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Server className="h-3 w-3 text-blue-400" />
                                    <span className="text-xs text-blue-400 truncate max-w-[80px]" title={`${proxy.proxy_host}:${proxy.proxy_port}`}>
                                      {proxy.proxy_host.split('.').slice(-2).join('.')}
                                    </span>
                                  </div>
                                ) : (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-6 px-2 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                    onClick={() => handleAssignProxy(account)}
                                    disabled={availableCount === 0}
                                    title={availableCount === 0 ? 'No available proxy' : 'Click to assign proxy'}
                                  >
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    No Proxy
                                  </Button>
                                )}
                              </div>
                            );
                          })()}
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
                              className={
                                account.status === 'active' 
                                  ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' 
                                  : account.status === 'suspended'
                                    ? 'bg-red-600/30 text-red-400 hover:bg-red-600/40'
                                    : ''
                              }
                            >
                              {account.status === 'active' ? (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                              ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              {account.status === 'active' 
                                ? 'active' 
                                : account.status === 'suspended' 
                                  ? 'Suspend' 
                                  : 'expired'}
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
                          {(() => {
                            const hasProxy = accountProxies.has(account.id);
                            return (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPostDialog(account)}
                                  disabled={account.status !== 'active' || !hasProxy}
                                  title={!hasProxy ? 'Assign proxy first' : 'Post photo'}
                                >
                                  <ImagePlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRefreshAccount(account)}
                                  disabled={!hasProxy}
                                  title={!hasProxy ? 'Assign proxy first' : 'Refresh account'}
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
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>


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
                              <span title={detail.error} className="text-xs text-red-400 max-w-32 truncate">{detail.error}</span>
                              <XCircle className="h-4 w-4 text-red-500" />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => setBulkPostLogsOpen(true)}
                      className="flex-1"
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      Logs
                    </Button>
                    <Button 
                      onClick={() => {
                        setBulkPostOpen(false);
                        setSelectedAccounts(new Set());
                      }}
                      className="flex-1"
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk Photo Post Logs Dialog */}
        <Dialog open={bulkPostLogsOpen} onOpenChange={setBulkPostLogsOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Photo Post Logs
              </DialogTitle>
              <DialogDescription>
                Image URLs used for each account ({bulkPostReport?.details.length || 0} total)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Filter tabs */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-muted">
                  All: {bulkPostReport?.details.length || 0}
                </Badge>
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                  Success: {bulkPostReport?.details.filter(d => d.status === 'success').length || 0}
                </Badge>
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
                  Failed: {bulkPostReport?.details.filter(d => d.status === 'failed').length || 0}
                </Badge>
              </div>

              {/* Logs list - show only last 50 to prevent crash */}
              <div className="max-h-96 overflow-y-auto space-y-2">
                {bulkPostReport && bulkPostReport.details.length > 50 && (
                  <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-500 text-center mb-2">
                    Showing last 50 of {bulkPostReport.details.length} logs
                  </div>
                )}
                {bulkPostReport?.details.slice(-50).map((detail, idx) => (
                  <div 
                    key={idx}
                    className={`p-3 rounded-lg text-sm border ${
                      detail.status === 'success' 
                        ? 'bg-green-500/5 border-green-500/20' 
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">@{detail.username}</span>
                      {detail.status === 'success' ? (
                        <Badge className="bg-green-500/20 text-green-500">Success</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-500">Failed</Badge>
                      )}
                    </div>

                    {(detail.statusCode || detail.error) && (
                      <div className="flex flex-wrap items-center gap-2">
                        {typeof detail.statusCode === 'number' && (
                          <Badge variant="outline" className="bg-muted">
                            HTTP {detail.statusCode}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {detail.photoUrl && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">Image URL:</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted p-1 rounded flex-1 truncate">
                            {detail.photoUrl}
                          </code>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(detail.photoUrl || '');
                              toast.success('URL copied!');
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {detail.error && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-destructive line-clamp-2">{String(detail.error).slice(0, 200)}</p>

                        {detail.errorBody && (
                          <details className="rounded-md border border-border bg-muted/40 p-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground">
                              Details
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground max-h-32 overflow-y-auto">
                              {String(detail.errorBody).slice(0, 500)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.open('https://supabase.com/dashboard/project/iilyhckcapcsoidabspp/functions/instagram-post-photo/logs', '_blank', 'noopener,noreferrer')}
                  className="flex-1"
                >
                  Open Edge Logs
                </Button>
                <Button 
                  onClick={() => setBulkPostLogsOpen(false)}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Link to Post Dialog */}
        <Dialog open={linkPostOpen} onOpenChange={(open) => {
          if (!linkPosting) setLinkPostOpen(open);
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-blue-500" />
                Link to Post
              </DialogTitle>
              <DialogDescription>
                Post same photo to {selectedAccounts.size} selected account(s) using image URL
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!linkPostReport ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="link-post-url">Image URL</Label>
                    <Input
                      id="link-post-url"
                      placeholder="https://example.com/image.jpg"
                      value={linkPostUrl}
                      onChange={(e) => handleLinkPostUrlChange(e.target.value)}
                      disabled={linkPosting}
                    />
                  </div>

                  {linkPostPreview && (
                    <div className="border border-border rounded-lg p-4">
                      <img 
                        src={linkPostPreview} 
                        alt="Preview" 
                        className="max-h-48 mx-auto rounded-lg"
                        onError={() => setLinkPostPreview('')}
                      />
                    </div>
                  )}

                  {linkPosting && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Posting to accounts...</span>
                        <span>{linkPostProgress}%</span>
                      </div>
                      <Progress value={linkPostProgress} className="h-2" />
                    </div>
                  )}

                  <Button 
                    onClick={handleLinkPost}
                    disabled={linkPosting || !linkPostUrl.trim()}
                    className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                  >
                    {linkPosting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Start Post
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <div className="space-y-4">
                  {/* Report Summary */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-2xl font-bold text-foreground">{linkPostReport.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="text-center p-3 bg-green-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-green-500">{linkPostReport.success}</p>
                      <p className="text-xs text-muted-foreground">Success</p>
                    </div>
                    <div className="text-center p-3 bg-red-500/10 rounded-lg">
                      <p className="text-2xl font-bold text-red-500">{linkPostReport.failed}</p>
                      <p className="text-xs text-muted-foreground">Failed</p>
                    </div>
                  </div>

                  {/* Details - show only last 50 to prevent crash */}
                  {linkPostReport.details.length > 50 && (
                    <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-500 text-center">
                      Showing last 50 of {linkPostReport.details.length} logs
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {linkPostReport.details.slice(-50).map((detail, idx) => (
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
                              <span title={detail.error} className="text-xs text-red-400 max-w-32 truncate">{String(detail.error || '').slice(0, 50)}</span>
                              <XCircle className="h-4 w-4 text-red-500" />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button 
                    onClick={() => {
                      setLinkPostOpen(false);
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

        {/* Bio Edit Dialog */}
        <Dialog open={bioEditOpen} onOpenChange={setBioEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Bio</DialogTitle>
              <DialogDescription>
                Update bio for @{bioEditAccount?.username}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="bio-text">Bio Text</Label>
                <Textarea
                  id="bio-text"
                  placeholder="Enter your bio..."
                  value={newBioText}
                  onChange={(e) => setNewBioText(e.target.value)}
                  rows={4}
                  maxLength={150}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {newBioText.length}/150
                </p>
              </div>
              <Button 
                onClick={handleUpdateBio} 
                disabled={updatingBio}
                className="w-full"
              >
                {updatingBio ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Bio'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Batch Rename Dialog */}
        <Dialog open={renameModalOpen} onOpenChange={setRenameModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Rename Batch
              </DialogTitle>
              <DialogDescription>
                Enter a new name for the batch
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="batch-rename">Batch Name</Label>
                <Input
                  id="batch-rename"
                  placeholder="Enter batch name..."
                  value={newBatchNameRename}
                  onChange={(e) => setNewBatchNameRename(e.target.value)}
                />
              </div>
              <Button 
                onClick={handleRenameBatch} 
                disabled={savingRename || !newBatchNameRename.trim()}
                className="w-full"
              >
                {savingRename ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
