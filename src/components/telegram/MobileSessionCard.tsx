import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, Send, Pencil, Trash2, Mail, Globe } from 'lucide-react';

interface TelegramSession {
  id: string;
  phone_number: string;
  session_name: string | null;
  telegram_name: string | null;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
  messages_sent: number | null;
  created_at: string;
}

interface MobileSessionCardProps {
  session: TelegramSession;
  index: number;
  selected: boolean;
  unreadCount?: number;
  onSelect: (checked: boolean) => void;
  onValidate: () => void;
  onSendMessage: () => void;
  onEditProxy: () => void;
  onDelete: () => void;
  onOpenUnread: () => void;
}

export function MobileSessionCard({
  session,
  index,
  selected,
  unreadCount,
  onSelect,
  onValidate,
  onSendMessage,
  onEditProxy,
  onDelete,
  onOpenUnread,
}: MobileSessionCardProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Active</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Expired</Badge>;
      case 'suspended':
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Suspended</Badge>;
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">#{index}</span>
            <span className="font-semibold text-foreground truncate">{session.phone_number}</span>
            {getStatusBadge(session.status)}
          </div>
          {session.telegram_name && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{session.telegram_name}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-secondary/50 rounded-lg py-2">
          <p className="font-semibold text-foreground">{session.messages_sent || 0}</p>
          <p className="text-muted-foreground">Messages</p>
        </div>
        <div className="bg-secondary/50 rounded-lg py-2">
          <button
            onClick={onOpenUnread}
            disabled={session.status !== 'active'}
            className="w-full disabled:opacity-50"
          >
            <p className={`font-semibold ${unreadCount && unreadCount > 0 ? 'text-primary' : 'text-foreground'}`}>
              {unreadCount !== undefined ? unreadCount : '-'}
            </p>
            <p className="text-muted-foreground">Replies</p>
          </button>
        </div>
        <div className="bg-secondary/50 rounded-lg py-2">
          <p className="font-semibold text-foreground">
            {new Date(session.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </p>
          <p className="text-muted-foreground">Added</p>
        </div>
      </div>

      {session.proxy_host && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span className="truncate">{session.proxy_host}:{session.proxy_port}</span>
        </div>
      )}

      <div className="flex gap-1.5 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={onValidate}
          className="flex-1 h-9 text-xs gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Test
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onSendMessage}
          disabled={session.status !== 'active'}
          className="flex-1 h-9 text-xs gap-1"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onEditProxy}
          className="h-9 text-xs px-2"
        >
          <Pencil className="h-3.5 w-3.5" />
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
