import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Instagram, 
  Shield,
  Settings, 
  LogOut,
  ChevronDown,
  Zap,
  Home,
  Package,
  Server,
  MessageSquare
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function AdminSidebar() {
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const [manageExpanded, setManageExpanded] = useState(true);

  const navItems = [
    { icon: LayoutDashboard, label: 'Admin Dashboard', path: '/admin' },
    { icon: Home, label: 'Back to App', path: '/dashboard' },
  ];

  const manageItems = [
    { icon: Users, label: 'Users', path: '/admin/users' },
    { icon: Instagram, label: 'Instagram Accounts', path: '/admin/instagram-accounts' },
    { icon: MessageSquare, label: 'Telegram Sessions', path: '/admin/telegram-sessions' },
    { icon: Shield, label: 'Roles', path: '/admin/roles' },
    { icon: Package, label: 'Packages', path: '/admin/packages' },
    { icon: Server, label: 'Photo Server', path: '/admin/photo-server' },
  ];

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive">
            <Shield className="h-5 w-5 text-destructive-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">SocialX Manager</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}

          {/* Manage Dropdown */}
          <div>
            <button
              onClick={() => setManageExpanded(!manageExpanded)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all',
                manageExpanded
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5" />
                Manage
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  manageExpanded && 'rotate-180'
                )}
              />
            </button>
            
            {manageExpanded && (
              <div className="ml-4 mt-1 space-y-1 border-l border-border pl-4">
                {manageItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-border p-4">
          <div className="mb-3 rounded-lg bg-destructive/10 p-3">
            <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                Admin
              </span>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-destructive transition-all hover:bg-destructive/10"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
