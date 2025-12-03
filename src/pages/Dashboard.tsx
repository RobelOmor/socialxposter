import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Instagram, Users, TrendingUp, Zap, Crown, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface Stats {
  totalAccounts: number;
  activeAccounts: number;
  totalFollowers: number;
  totalPosts: number;
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    totalAccounts: 0,
    activeAccounts: 0,
    totalFollowers: 0,
    totalPosts: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('*');

    if (!error && data) {
      setStats({
        totalAccounts: data.length,
        activeAccounts: data.filter(a => a.status === 'active').length,
        totalFollowers: data.reduce((sum, a) => sum + (a.followers_count || 0), 0),
        totalPosts: data.reduce((sum, a) => sum + (a.posts_count || 0), 0),
      });
    }
  };

  const statCards = [
    {
      title: 'Total Accounts',
      value: stats.totalAccounts,
      limit: profile?.account_limit || 2,
      icon: Instagram,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
    },
    {
      title: 'Active Accounts',
      value: stats.activeAccounts,
      icon: Zap,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Total Followers',
      value: stats.totalFollowers.toLocaleString(),
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Total Posts',
      value: stats.totalPosts.toLocaleString(),
      icon: TrendingUp,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Welcome back, {profile?.full_name?.split(' ')[0]}!
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening with your social accounts today.
            </p>
          </div>
          
          {profile?.subscription_plan === 'free' && (
            <Card className="glass-card border-primary/20 gradient-border">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Upgrade to Premium</p>
                  <p className="text-xs text-muted-foreground">Get unlimited accounts</p>
                </div>
                <Button size="sm" className="ml-4">
                  Upgrade
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat, index) => (
            <Card key={index} className="glass-card border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`h-12 w-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  {stat.limit && (
                    <span className="text-xs text-muted-foreground">
                      Limit: {stat.limit}
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Get started with your social accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                className="w-full justify-between group"
                onClick={() => navigate('/instagram-manage')}
              >
                <div className="flex items-center gap-3">
                  <Instagram className="h-5 w-5 text-pink-500" />
                  Add Instagram Account
                </div>
                <ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between group"
                onClick={() => navigate('/settings')}
              >
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-primary" />
                  Manage Settings
                </div>
                <ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Plan Details</CardTitle>
              <CardDescription>Your current subscription</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground capitalize">
                      {profile?.subscription_plan} Plan
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.account_limit} account{profile?.account_limit !== 1 ? 's' : ''} allowed
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    profile?.subscription_plan === 'premium' 
                      ? 'bg-primary/20 text-primary' 
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {profile?.subscription_plan === 'premium' ? 'Active' : 'Basic'}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Accounts used: {stats.totalAccounts} / {profile?.account_limit}</p>
                  <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all"
                      style={{ 
                        width: `${Math.min((stats.totalAccounts / (profile?.account_limit || 1)) * 100, 100)}%` 
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
