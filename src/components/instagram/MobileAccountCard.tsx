import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RefreshCw, ImagePlus, Trash2, Sparkles, Pencil } from 'lucide-react';

interface InstagramAccount {
  id: string;
  username: string;
  full_name: string | null;
  profile_pic_url: string | null;
  posts_count: number;
  followers_count: number;
  following_count: number;
  status: 'active' | 'expired' | 'pending' | 'suspended';
  created_at: string | null;
  bio: string | null;
}

interface MobileAccountCardProps {
  account: InstagramAccount;
  index: number;
  selected: boolean;
  isToday: boolean;
  onSelect: (checked: boolean) => void;
  onRefresh: () => void;
  onAddPhoto: () => void;
  onDelete: () => void;
  onEditBio: () => void;
}

export function MobileAccountCard({
  account,
  index,
  selected,
  isToday,
  onSelect,
  onRefresh,
  onAddPhoto,
  onDelete,
  onEditBio,
}: MobileAccountCardProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Expired</Badge>;
      case 'suspended':
        return <Badge className="bg-red-600/20 text-red-500 border-red-600/30 text-xs">Suspend</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="mobile-card space-y-3">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          className="mt-1"
        />
        <Avatar className="h-12 w-12 border border-border shrink-0">
          <AvatarImage 
            src={account.profile_pic_url 
              ? `https://iilyhckcapcsoidabspp.supabase.co/functions/v1/proxy-image?url=${encodeURIComponent(account.profile_pic_url)}`
              : ''
            } 
          />
          <AvatarFallback className="bg-pink-500/10 text-pink-500 text-sm">
            {account.username?.[0]?.toUpperCase() || 'I'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">@{account.username}</span>
            {getStatusBadge(account.status)}
            {isToday && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                New
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{account.full_name || 'No name'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-secondary/50 rounded-lg py-2">
          <p className="font-semibold text-foreground">{account.posts_count?.toLocaleString() || 0}</p>
          <p className="text-muted-foreground">Posts</p>
        </div>
        <div className="bg-secondary/50 rounded-lg py-2">
          <p className="font-semibold text-foreground">{account.followers_count?.toLocaleString() || 0}</p>
          <p className="text-muted-foreground">Followers</p>
        </div>
        <div className="bg-secondary/50 rounded-lg py-2">
          <p className="font-semibold text-foreground">{account.following_count?.toLocaleString() || 0}</p>
          <p className="text-muted-foreground">Following</p>
        </div>
      </div>

      {account.bio && (
        <button 
          onClick={onEditBio}
          className="text-xs text-muted-foreground line-clamp-2 text-left hover:text-foreground transition-colors"
        >
          {account.bio}
        </button>
      )}
      {!account.bio && (
        <button 
          onClick={onEditBio}
          className="text-xs text-muted-foreground/50 italic hover:text-muted-foreground transition-colors text-left"
        >
          no_bio_set
        </button>
      )}

      <div className="flex gap-1.5 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          className="flex-1 h-9 text-xs gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button
          size="sm"
          onClick={onAddPhoto}
          disabled={account.status !== 'active'}
          className="flex-1 h-9 text-xs gap-1 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Photo
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          className="h-9 text-xs px-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
