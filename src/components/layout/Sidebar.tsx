import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Share2, 
  Instagram, 
  Settings, 
  LogOut,
  ChevronDown,
  Zap,
  Shield,
  X,
  MessageSquare
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { signOut, profile, isAdmin } = useAuth();
  const [socialExpanded, setSocialExpanded] = useState(
    location.pathname.includes('/social') || location.pathname.includes('/instagram') || location.pathname.includes('/telegram')
  );

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  ];

  const socialItems = [
    { icon: Instagram, label: 'Instagram Manage', path: '/instagram-manage' },
    { icon: MessageSquare, label: 'Telegram Manage', path: '/telegram-manage' },
  ];

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-50 h-screen w-64 border-r border-border/50 bg-sidebar/95 backdrop-blur-xl transition-transform duration-300",
      // Mobile: translate based on isOpen state
      isOpen ? "translate-x-0" : "-translate-x-full",
      // Desktop: always visible
      "lg:translate-x-0"
    )}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-border/50 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-purple-600 shadow-lg shadow-primary/25">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">SocialX</h1>
              <p className="text-xs text-muted-foreground">Account Manager</p>
            </div>
          </div>
          
          {/* Close button for mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-primary to-purple-600 text-primary-foreground shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}

          {/* Social Manage Dropdown */}
          <div>
            <button
              onClick={() => setSocialExpanded(!socialExpanded)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                socialExpanded || location.pathname.includes('/instagram')
                  ? 'bg-secondary/80 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-3">
                <Share2 className="h-5 w-5" />
                Social Manage
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  socialExpanded && 'rotate-180'
                )}
              />
            </button>
            
            {socialExpanded && (
              <div className="ml-4 mt-1 space-y-1 border-l-2 border-primary/30 pl-4">
                {socialItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={handleNavClick}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/25'
                          : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
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

          <NavLink
            to="/settings"
            onClick={handleNavClick}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-gradient-to-r from-primary to-purple-600 text-primary-foreground shadow-lg shadow-primary/25'
                  : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              )
            }
          >
            <Settings className="h-5 w-5" />
            Settings
          </NavLink>

          {isAdmin && (
            <NavLink
              to="/admin"
              onClick={handleNavClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg shadow-red-500/25'
                    : 'text-destructive hover:bg-destructive/10'
                )
              }
            >
              <Shield className="h-5 w-5" />
              Admin Panel
            </NavLink>
          )}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-border/50 p-4">
          <div className="mb-3 rounded-xl bg-gradient-to-br from-secondary/80 to-secondary/40 p-3 backdrop-blur">
            <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                profile?.subscription_plan === 'premium' 
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white" 
                  : "bg-muted text-muted-foreground"
              )}>
                {profile?.subscription_plan === 'premium' ? '⭐ Premium' : 'Free'}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              signOut();
              if (onClose) onClose();
            }}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-destructive transition-all duration-200 hover:bg-destructive/10"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
