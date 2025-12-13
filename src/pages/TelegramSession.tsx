import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, MessageSquare, Reply, Bot, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { SessionUpload } from "@/components/telegram/SessionUpload";
import { SessionList } from "@/components/telegram/SessionList";
import { BulkMessaging } from "@/components/telegram/BulkMessaging";
import { ReplyTracker } from "@/components/telegram/ReplyTracker";
import { AutoReplyConfig } from "@/components/telegram/AutoReplyConfig";
import { ApiConfig } from "@/components/telegram/ApiConfig";

interface TelegramSessionData {
  id: string;
  phone_number: string;
  session_name: string | null;
  status: string;
  proxy_host: string | null;
  proxy_port: number | null;
  messages_sent: number | null;
  replies_received: number | null;
}

const TelegramSession = () => {
  const [sessions, setSessions] = useState<TelegramSessionData[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [pythonApiUrl, setPythonApiUrl] = useState(() => {
    return localStorage.getItem("telegram_api_url") || "";
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchSessions = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("telegram_sessions")
      .select("id, phone_number, session_name, status, proxy_host, proxy_port, messages_sent, replies_received")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sessions:", error);
    } else {
      setSessions(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleApiUrlChange = (url: string) => {
    setPythonApiUrl(url);
    localStorage.setItem("telegram_api_url", url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telegram Session Manager</h1>
          <p className="text-muted-foreground">
            Manage Telegram sessions, send bulk messages, and track replies
          </p>
        </div>

        <Tabs defaultValue="sessions" className="space-y-4">
          <TabsList className="bg-muted">
            <TabsTrigger value="sessions" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Sessions
            </TabsTrigger>
            <TabsTrigger value="messaging" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Bulk Message
            </TabsTrigger>
            <TabsTrigger value="replies" className="flex items-center gap-2">
              <Reply className="h-4 w-4" />
              Replies
            </TabsTrigger>
            <TabsTrigger value="auto-reply" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Auto-Reply
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              API Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SessionUpload onSessionAdded={fetchSessions} />
              <SessionList
                sessions={sessions}
                selectedSessions={selectedSessions}
                onSelectionChange={setSelectedSessions}
                onSessionsChange={fetchSessions}
              />
            </div>
          </TabsContent>

          <TabsContent value="messaging">
            <BulkMessaging
              selectedSessions={selectedSessions}
              pythonApiUrl={pythonApiUrl}
            />
          </TabsContent>

          <TabsContent value="replies">
            <ReplyTracker pythonApiUrl={pythonApiUrl} />
          </TabsContent>

          <TabsContent value="auto-reply">
            <AutoReplyConfig />
          </TabsContent>

          <TabsContent value="settings">
            <ApiConfig
              apiUrl={pythonApiUrl}
              onApiUrlChange={handleApiUrlChange}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default TelegramSession;
