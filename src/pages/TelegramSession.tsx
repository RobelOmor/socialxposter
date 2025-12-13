import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, MessageSquare, Users, User, Loader2 } from "lucide-react";

const TelegramSession = () => {
  const [sessionString, setSessionString] = useState("");
  const [destinationType, setDestinationType] = useState<"user" | "group">("user");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendMessage = async () => {
    if (!sessionString.trim()) {
      toast.error("Session string দিন");
      return;
    }
    if (!destination.trim()) {
      toast.error(destinationType === "user" ? "Username বা Phone number দিন" : "Group/Channel username দিন");
      return;
    }
    if (!message.trim()) {
      toast.error("Message লিখুন");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-send-message", {
        body: {
          sessionString: sessionString.trim(),
          destinationType,
          destination: destination.trim(),
          message: message.trim(),
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("Message সফলভাবে পাঠানো হয়েছে!");
        setMessage("");
      } else {
        throw new Error(data?.error || "Message পাঠাতে ব্যর্থ");
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(error.message || "Message পাঠাতে সমস্যা হয়েছে");
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Telegram Session</h1>
          <p className="text-muted-foreground">Telegram session দিয়ে message পাঠান</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Session Input Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Session Configuration
              </CardTitle>
              <CardDescription>
                আপনার Telegram session string পেস্ট করুন (Telethon/Pyrogram format)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="session">Session String</Label>
                <Textarea
                  id="session"
                  placeholder="আপনার session string এখানে পেস্ট করুন..."
                  value={sessionString}
                  onChange={(e) => setSessionString(e.target.value)}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            </CardContent>
          </Card>

          {/* Destination Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Message Destination
              </CardTitle>
              <CardDescription>
                কোথায় message পাঠাতে চান সেটি নির্বাচন করুন
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label>Destination Type</Label>
                <RadioGroup
                  value={destinationType}
                  onValueChange={(v) => setDestinationType(v as "user" | "group")}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="user" id="user" />
                    <Label htmlFor="user" className="flex items-center gap-1 cursor-pointer">
                      <User className="h-4 w-4" />
                      User
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="group" id="group" />
                    <Label htmlFor="group" className="flex items-center gap-1 cursor-pointer">
                      <Users className="h-4 w-4" />
                      Group/Channel
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">
                  {destinationType === "user" ? "Username / Phone Number" : "Group/Channel Username"}
                </Label>
                <Input
                  id="destination"
                  placeholder={destinationType === "user" ? "@username অথবা +8801XXXXXXXXX" : "@groupname অথবা channel link"}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Message Card */}
        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
            <CardDescription>যে message পাঠাতে চান সেটি লিখুন</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="আপনার message এখানে লিখুন..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
            <Button
              onClick={handleSendMessage}
              disabled={sending || !sessionString.trim() || !destination.trim() || !message.trim()}
              className="w-full"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Message
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TelegramSession;
