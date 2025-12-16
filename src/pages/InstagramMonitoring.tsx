import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  Image as ImageIcon,
  Globe,
  AlertTriangle,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface AccountStats {
  total: number;
  active: number;
  expired: number;
  suspended: number;
  pending: number;
}

interface ProxyStats {
  total: number;
  available: number;
  used: number;
}

interface PostingStats {
  totalPostsToday: number;
  accountsPostedToday: number;
  accountsInCooldown: number;
  accountsAtLimit: number;
}

const DAILY_POST_LIMIT = 3;
const COOLDOWN_MINUTES = 30;

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

export default function InstagramMonitoring() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accountStats, setAccountStats] = useState<AccountStats>({ total: 0, active: 0, expired: 0, suspended: 0, pending: 0 });
  const [proxyStats, setProxyStats] = useState<ProxyStats>({ total: 0, available: 0, used: 0 });
  const [postingStats, setPostingStats] = useState<PostingStats>({ totalPostsToday: 0, accountsPostedToday: 0, accountsInCooldown: 0, accountsAtLimit: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    if (!user) return;
    
    setRefreshing(true);

    // Fetch account stats
    const { data: accounts } = await supabase
      .from('instagram_accounts')
      .select('status, last_posted_at, posts_today, posts_today_date')
      .eq('user_id', user.id);

    if (accounts) {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      const stats: AccountStats = {
        total: accounts.length,
        active: accounts.filter(a => a.status === 'active').length,
        expired: accounts.filter(a => a.status === 'expired').length,
        suspended: accounts.filter(a => a.status === 'suspended').length,
        pending: accounts.filter(a => a.status === 'pending').length,
      };
      setAccountStats(stats);

      // Calculate posting stats
      let totalPostsToday = 0;
      let accountsPostedToday = 0;
      let accountsInCooldown = 0;
      let accountsAtLimit = 0;

      for (const acc of accounts) {
        if (acc.posts_today_date === today) {
          totalPostsToday += acc.posts_today || 0;
          if ((acc.posts_today || 0) > 0) accountsPostedToday++;
          if ((acc.posts_today || 0) >= DAILY_POST_LIMIT) accountsAtLimit++;
        }

        if (acc.last_posted_at) {
          const lastPosted = new Date(acc.last_posted_at);
          const minutesSince = (now.getTime() - lastPosted.getTime()) / (1000 * 60);
          if (minutesSince < COOLDOWN_MINUTES) accountsInCooldown++;
        }
      }

      setPostingStats({ totalPostsToday, accountsPostedToday, accountsInCooldown, accountsAtLimit });
    }

    // Fetch proxy stats
    const { data: proxies } = await supabase
      .from('instagram_proxies')
      .select('status, used_by_account_id')
      .eq('user_id', user.id);

    if (proxies) {
      setProxyStats({
        total: proxies.length,
        available: proxies.filter(p => p.status === 'available' && !p.used_by_account_id).length,
        used: proxies.filter(p => p.used_by_account_id).length,
      });
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const accountStatusData = [
    { name: 'Active', value: accountStats.active, color: 'hsl(142, 76%, 36%)' },
    { name: 'Expired', value: accountStats.expired, color: 'hsl(0, 84%, 60%)' },
    { name: 'Suspended', value: accountStats.suspended, color: 'hsl(0, 84%, 40%)' },
    { name: 'Pending', value: accountStats.pending, color: 'hsl(45, 93%, 47%)' },
  ].filter(d => d.value > 0);

  const proxyUsageData = [
    { name: 'Available', value: proxyStats.available, color: 'hsl(142, 76%, 36%)' },
    { name: 'Used', value: proxyStats.used, color: 'hsl(217, 91%, 60%)' },
  ].filter(d => d.value > 0);

  const postingCapacityUsed = accountStats.active > 0 
    ? Math.round((postingStats.totalPostsToday / (accountStats.active * DAILY_POST_LIMIT)) * 100)
    : 0;

  const proxyUsagePercent = proxyStats.total > 0
    ? Math.round((proxyStats.used / proxyStats.total) * 100)
    : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Instagram Monitoring</h1>
            <p className="text-muted-foreground">Real-time operations dashboard</p>
          </div>
          <Button 
            variant="outline" 
            onClick={fetchStats} 
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accountStats.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {accountStats.active} active, {accountStats.expired + accountStats.suspended} issues
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Proxies</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{proxyStats.total.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {proxyStats.available} available, {proxyStats.used} assigned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Posts Today</CardTitle>
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{postingStats.totalPostsToday}</div>
              <p className="text-xs text-muted-foreground">
                from {postingStats.accountsPostedToday} accounts
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">{postingStats.accountsInCooldown}</div>
              <p className="text-xs text-muted-foreground">
                in cooldown, {postingStats.accountsAtLimit} at daily limit
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Capacity Meters */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Daily Posting Capacity
              </CardTitle>
              <CardDescription>
                {postingStats.totalPostsToday} / {accountStats.active * DAILY_POST_LIMIT} posts ({DAILY_POST_LIMIT}/account)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={postingCapacityUsed} className="h-3" />
              <p className="mt-2 text-sm text-muted-foreground">
                {100 - postingCapacityUsed}% capacity remaining today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Proxy Utilization
              </CardTitle>
              <CardDescription>
                {proxyStats.used} / {proxyStats.total} proxies assigned to accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={proxyUsagePercent} className="h-3" />
              <p className="mt-2 text-sm text-muted-foreground">
                {proxyStats.available} proxies available for new accounts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Account Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {accountStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={accountStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {accountStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                  No accounts yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Proxy Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              {proxyUsageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={proxyUsageData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {proxyUsageData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                  No proxies yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Operations Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ready to Post</p>
                  <p className="text-xl font-bold">
                    {accountStats.active - postingStats.accountsInCooldown - postingStats.accountsAtLimit}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Clock className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">In Cooldown</p>
                  <p className="text-xl font-bold">{postingStats.accountsInCooldown}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">At Daily Limit</p>
                  <p className="text-xl font-bold">{postingStats.accountsAtLimit}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Need Attention</p>
                  <p className="text-xl font-bold">{accountStats.expired + accountStats.suspended}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
