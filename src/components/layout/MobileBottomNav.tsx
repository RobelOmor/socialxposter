import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Instagram, 
  MessageSquare, 
  Settings, 
  Shield,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export function MobileBottomNav() {
  const { isAdmin, signOut } = useAuth();
  const location = useLocation();

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Instagram, label: 'Instagram', path: '/instagram-manage' },
    { icon: MessageSquare, label: 'Telegram', path: '/telegram-manage' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  if (isAdmin) {
    navItems.push({ icon: Shield, label: 'Admin', path: '/admin' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 min-w-[56px] transition-all duration-200',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground'
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-200",
                isActive && "bg-primary/20"
              )}>
                <item.icon className={cn(
                  "h-5 w-5 transition-all",
                  isActive && "scale-110"
                )} />
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          );
        })}
        
        {/* Logout button */}
        <button
          onClick={() => signOut()}
          className="flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 min-w-[56px] transition-all duration-200 text-destructive"
        >
          <div className="p-1.5 rounded-xl transition-all duration-200">
            <LogOut className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-medium">Logout</span>
        </button>
      </div>
    </nav>
  );
}
