import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Reply, Send, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ReplyData {
  id: string;
  from_user: string;
  from_user_id: string | null;
  message_content: string;
  replied: boolean;
  reply_content: string | null;
  created_at: string;
  session_id: string;
}

interface ReplyTrackerProps {
  pythonApiUrl: string;
}

export const ReplyTracker = ({ pythonApiUrl }: ReplyTrackerProps) => {
  const { toast } = useToast();
  const [replies, setReplies] = useState<ReplyData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const fetchReplies = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("telegram_replies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching replies:", error);
    } else {
      setReplies(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReplies();
  }, []);

  const handleReply = async (reply: ReplyData) => {
    if (!replyMessage.trim()) {
      toast({ title: "Error", description: "Enter a reply message", variant: "destructive" });
      return;
    }

    if (!pythonApiUrl) {
      toast({ title: "Error", description: "Configure Python API URL first", variant: "destructive" });
      return;
    }

    setIsSending(true);

    try {
      // Get session data
      const { data: session } = await supabase
        .from("telegram_sessions")
        .select("*")
        .eq("id", reply.session_id)
        .single();

      if (!session) {
        toast({ title: "Error", description: "Session not found", variant: "destructive" });
        setIsSending(false);
        return;
      }

      // Send reply via Python API
      const response = await fetch(`${pythonApiUrl}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_data: session.session_data,
          phone_number: session.phone_number,
          destination: reply.from_user_id || reply.from_user,
          message: replyMessage,
          proxy: session.proxy_host
            ? {
                host: session.proxy_host,
                port: session.proxy_port,
                username: session.proxy_username,
                password: session.proxy_password,
              }
            : null,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Update reply status in database
        await supabase
          .from("telegram_replies")
          .update({
            replied: true,
            reply_content: replyMessage,
            replied_at: new Date().toISOString(),
          })
          .eq("id", reply.id);

        toast({ title: "Success", description: "Reply sent successfully" });
        setReplyingTo(null);
        setReplyMessage("");
        fetchReplies();
      } else {
        toast({ title: "Error", description: result.error || "Failed to send reply", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({ title: "Error", description: "Failed to send reply", variant: "destructive" });
    }

    setIsSending(false);
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MessageCircle className="h-5 w-5" />
          Reply Tracker ({replies.length})
        </CardTitle>
        <Button variant="outline" size="sm" onClick={fetchReplies} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {replies.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No replies yet</p>
          ) : (
            replies.map((reply) => (
              <div
                key={reply.id}
                className="p-3 bg-background rounded-lg border border-border space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{reply.from_user}</span>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        reply.replied
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                      }
                    >
                      {reply.replied ? "Replied" : "Pending"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(reply.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                  {reply.message_content}
                </p>

                {reply.replied && reply.reply_content && (
                  <div className="flex items-start gap-2">
                    <Reply className="h-4 w-4 text-green-400 mt-0.5" />
                    <p className="text-sm text-green-300">{reply.reply_content}</p>
                  </div>
                )}

                {!reply.replied && (
                  <div className="space-y-2">
                    {replyingTo === reply.id ? (
                      <>
                        <Textarea
                          placeholder="Type your reply..."
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          rows={2}
                          className="bg-muted"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReply(reply)}
                            disabled={isSending}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            {isSending ? "Sending..." : "Send"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyMessage("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReplyingTo(reply.id)}
                      >
                        <Reply className="h-4 w-4 mr-1" />
                        Reply
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
