import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Send, Users, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BulkMessagingProps {
  selectedSessions: string[];
  pythonApiUrl: string;
}

export const BulkMessaging = ({ selectedSessions, pythonApiUrl }: BulkMessagingProps) => {
  const { toast } = useToast();
  const [usernames, setUsernames] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const handleSendBulk = async () => {
    if (selectedSessions.length === 0) {
      toast({ title: "Error", description: "Select at least one session", variant: "destructive" });
      return;
    }

    const usernameList = usernames
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (usernameList.length === 0) {
      toast({ title: "Error", description: "Enter at least one username", variant: "destructive" });
      return;
    }

    if (!message.trim()) {
      toast({ title: "Error", description: "Enter a message", variant: "destructive" });
      return;
    }

    if (!pythonApiUrl) {
      toast({ title: "Error", description: "Configure Python API URL first", variant: "destructive" });
      return;
    }

    setIsSending(true);
    setProgress(0);
    setResults({ success: 0, failed: 0 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get session data for selected sessions
    const { data: sessions } = await supabase
      .from("telegram_sessions")
      .select("*")
      .in("id", selectedSessions);

    if (!sessions || sessions.length === 0) {
      toast({ title: "Error", description: "No valid sessions found", variant: "destructive" });
      setIsSending(false);
      return;
    }

    const totalOperations = usernameList.length;
    let completed = 0;
    let successCount = 0;
    let failedCount = 0;

    // Distribute usernames across sessions (round-robin)
    for (let i = 0; i < usernameList.length; i++) {
      const username = usernameList[i];
      const session = sessions[i % sessions.length];

      try {
        // Call Python API
        const response = await fetch(`${pythonApiUrl}/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_data: session.session_data,
            phone_number: session.phone_number,
            destination: username,
            message: message,
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

        // Log message to database
        await supabase.from("telegram_messages").insert({
          user_id: user.id,
          session_id: session.id,
          destination: username,
          destination_type: "user",
          message_content: message,
          status: result.success ? "sent" : "failed",
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
        });

        if (result.success) {
          successCount++;
          // Update session stats
          await supabase
            .from("telegram_sessions")
            .update({
              messages_sent: (session.messages_sent || 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq("id", session.id);
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error("Error sending message:", error);
        failedCount++;

        await supabase.from("telegram_messages").insert({
          user_id: user.id,
          session_id: session.id,
          destination: username,
          destination_type: "user",
          message_content: message,
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
        });
      }

      completed++;
      setProgress((completed / totalOperations) * 100);
      setResults({ success: successCount, failed: failedCount });

      // Add delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setIsSending(false);
    toast({
      title: "Bulk Messaging Complete",
      description: `Sent: ${successCount}, Failed: ${failedCount}`,
    });
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Send className="h-5 w-5" />
          Bulk Messaging
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>Selected Sessions: {selectedSessions.length}</span>
        </div>

        <div>
          <Label className="text-muted-foreground">Usernames (one per line)</Label>
          <Textarea
            placeholder="@username1&#10;@username2&#10;+8801234567890"
            value={usernames}
            onChange={(e) => setUsernames(e.target.value)}
            rows={5}
            className="bg-background mt-1"
            disabled={isSending}
          />
          <span className="text-xs text-muted-foreground">
            {usernames.split("\n").filter((u) => u.trim()).length} usernames
          </span>
        </div>

        <div>
          <Label className="text-muted-foreground">Message</Label>
          <Textarea
            placeholder="Enter your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="bg-background mt-1"
            disabled={isSending}
          />
        </div>

        {isSending && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress: {Math.round(progress)}%</span>
              <span className="text-green-400">✓ {results.success}</span>
              <span className="text-red-400">✗ {results.failed}</span>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200">
            <strong>Warning:</strong> Bulk messaging may result in account restrictions. Use with caution and add delays between messages.
          </div>
        </div>

        <Button
          onClick={handleSendBulk}
          disabled={isSending || selectedSessions.length === 0}
          className="w-full"
        >
          {isSending ? "Sending..." : "Send Bulk Messages"}
        </Button>
      </CardContent>
    </Card>
  );
};
