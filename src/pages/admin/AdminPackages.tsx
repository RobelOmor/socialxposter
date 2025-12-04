import { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Package, ArrowUpDown, History, Crown, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  subscription_plan: 'free' | 'premium';
  account_limit: number | null;
  created_at: string;
}

interface SubscriptionHistory {
  id: string;
  user_id: string;
  admin_id: string;
  previous_plan: 'free' | 'premium' | null;
  new_plan: 'free' | 'premium';
  previous_limit: number | null;
  new_limit: number | null;
  notes: string | null;
  created_at: string;
  expire_at: string | null;
}

export default function AdminPackages() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlan, setNewPlan] = useState<'free' | 'premium'>('free');
  const [newLimit, setNewLimit] = useState<string>('1000');
  const [expireAt, setExpireAt] = useState<string>('');
  const [notes, setNotes] = useState('');

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users-packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
    enabled: isAdmin,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['subscription-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as SubscriptionHistory[];
    },
    enabled: isAdmin,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, plan, limit, expire, note }: { 
      userId: string; 
      plan: 'free' | 'premium'; 
      limit: number | null;
      expire: string | null;
      note: string;
    }) => {
      // Get current user info
      const currentUser = users?.find(u => u.id === userId);
      
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          subscription_plan: plan,
          account_limit: limit 
        })
        .eq('id', userId);
      
      if (updateError) throw updateError;

      // Insert history record
      const { error: historyError } = await supabase
        .from('subscription_history')
        .insert({
          user_id: userId,
          admin_id: user?.id,
          previous_plan: currentUser?.subscription_plan || null,
          new_plan: plan,
          previous_limit: currentUser?.account_limit,
          new_limit: limit,
          notes: note || null,
          expire_at: expire || null,
        });

      if (historyError) throw historyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users-packages'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-history'] });
      toast.success('Package updated successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to update package: ' + error.message);
    },
  });

  const resetForm = () => {
    setSelectedUser(null);
    setNewPlan('free');
    setNewLimit('1000');
    setExpireAt('');
    setNotes('');
  };

  const openModal = (userProfile: Profile) => {
    setSelectedUser(userProfile);
    setNewPlan(userProfile.subscription_plan);
    setNewLimit(userProfile.account_limit?.toString() || '');
    setIsModalOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedUser) return;
    
    const limitValue = newPlan === 'premium' && newLimit === '' ? null : parseInt(newLimit) || 1000;
    
    updateMutation.mutate({
      userId: selectedUser.id,
      plan: newPlan,
      limit: limitValue,
      expire: expireAt || null,
      note: notes,
    });
  };

  const getUserName = (userId: string) => {
    return users?.find(u => u.id === userId)?.full_name || 'Unknown';
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-6 w-6" />
            Package Management
          </h1>
          <p className="text-muted-foreground mt-1">Manage user subscription plans and limits</p>
        </div>

        {/* Users Table */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Packages
            </CardTitle>
            <CardDescription>Upgrade or downgrade user subscriptions</CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Account Limit</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users?.map((userProfile, index) => (
                    <TableRow key={userProfile.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{userProfile.full_name}</TableCell>
                      <TableCell>{userProfile.email}</TableCell>
                      <TableCell>
                        <Badge variant={userProfile.subscription_plan === 'premium' ? 'default' : 'secondary'}>
                          {userProfile.subscription_plan === 'premium' && <Crown className="h-3 w-3 mr-1" />}
                          {userProfile.subscription_plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {userProfile.account_limit === null ? 'Unlimited' : userProfile.account_limit}
                      </TableCell>
                      <TableCell>
                        {format(new Date(userProfile.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => openModal(userProfile)}>
                          <ArrowUpDown className="h-4 w-4 mr-1" />
                          Change
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* History Table */}
        <Card className="glass-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Package Change History
            </CardTitle>
            <CardDescription>Track all subscription changes</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : history && history.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Previous Plan</TableHead>
                    <TableHead>New Plan</TableHead>
                    <TableHead>Prev Limit</TableHead>
                    <TableHead>New Limit</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expire</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((record, index) => (
                    <TableRow key={record.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-medium">{getUserName(record.user_id)}</TableCell>
                      <TableCell>
                        {record.previous_plan ? (
                          <Badge variant="outline">{record.previous_plan}</Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.new_plan === 'premium' ? 'default' : 'secondary'}>
                          {record.new_plan}
                        </Badge>
                      </TableCell>
                      <TableCell>{record.previous_limit ?? 'Unlimited'}</TableCell>
                      <TableCell>{record.new_limit ?? 'Unlimited'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{record.notes || '-'}</TableCell>
                      <TableCell>
                        {format(new Date(record.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {record.expire_at ? format(new Date(record.expire_at), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No history records yet</p>
            )}
          </CardContent>
        </Card>

        {/* Change Package Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Package</DialogTitle>
              <DialogDescription>
                Update subscription for {selectedUser?.full_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Subscription Plan</Label>
                <Select value={newPlan} onValueChange={(v) => setNewPlan(v as 'free' | 'premium')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Account Limit (empty = unlimited)</Label>
                <Input
                  type="number"
                  value={newLimit}
                  onChange={(e) => setNewLimit(e.target.value)}
                  placeholder="Enter limit or leave empty for unlimited"
                />
              </div>

              <div className="space-y-2">
                <Label>Expire Date (optional)</Label>
                <Input
                  type="date"
                  value={expireAt}
                  onChange={(e) => setExpireAt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this change..."
                  rows={3}
                />
              </div>

              <Button 
                onClick={handleUpdate} 
                className="w-full"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update Package
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
