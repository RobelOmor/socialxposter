import { Bell, Search, Menu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { profile } = useAuth();
  
  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase() || 'U';

  return (
    <header className={cn(
      "fixed right-0 top-0 z-30 h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl",
      "left-0 lg:left-64" // Full width on mobile, offset on desktop
    )}>
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          {/* Search - hidden on mobile */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="w-64 bg-secondary/50 pl-10 border-none rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
          </Button>
          
          <div className="flex items-center gap-2 md:gap-3">
            <Avatar className="h-9 w-9 border-2 border-primary/30 ring-2 ring-primary/10">
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary text-sm font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-foreground">{profile?.full_name}</p>
              <div className="flex items-center gap-1">
                {profile?.subscription_plan === 'premium' && (
                  <Sparkles className="h-3 w-3 text-amber-500" />
                )}
                <p className="text-xs text-muted-foreground capitalize">{profile?.subscription_plan} Plan</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
