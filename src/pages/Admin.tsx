import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Users, Instagram, Shield, Activity } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function Admin() {
  const { isAdmin, loading } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersRes, accountsRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('instagram_accounts').select('id', { count: 'exact', head: true }),
        supabase.from('user_roles').select('id', { count: 'exact', head: true }),
      ]);
      
      return {
        users: usersRes.count || 0,
        accounts: accountsRes.count || 0,
        roles: rolesRes.count || 0,
      };
    },
    enabled: isAdmin,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const statCards = [
    { title: 'Total Users', value: stats?.users || 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Instagram Accounts', value: stats?.accounts || 0, icon: Instagram, color: 'text-pink-500', bg: 'bg-pink-500/10' },
    { title: 'User Roles', value: stats?.roles || 0, icon: Shield, color: 'text-green-500', bg: 'bg-green-500/10' },
    { title: 'Active Sessions', value: '-', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users, accounts, and system settings</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href="/admin/users" className="flex items-center gap-3 rounded-lg p-3 hover:bg-secondary transition-colors">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Manage Users</span>
              </a>
              <a href="/admin/instagram-accounts" className="flex items-center gap-3 rounded-lg p-3 hover:bg-secondary transition-colors">
                <Instagram className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Manage Instagram Accounts</span>
              </a>
              <a href="/admin/roles" className="flex items-center gap-3 rounded-lg p-3 hover:bg-secondary transition-colors">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Manage Roles</span>
              </a>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Current system health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Database</span>
                <span className="flex items-center gap-2 text-sm font-medium text-green-500">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Edge Functions</span>
                <span className="flex items-center gap-2 text-sm font-medium text-green-500">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Authentication</span>
                <span className="flex items-center gap-2 text-sm font-medium text-green-500">
                  <span className="h-2 w-2 rounded-full bg-green-500"></span>
                  Operational
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
