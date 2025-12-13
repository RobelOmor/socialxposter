import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Send, MessageSquare, Users, User, Loader2, Upload, Phone, Trash2, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface TelegramSession {
  id: string;
  phone_number: string;
  session_name: string | null;
  status: string;
  created_at: string;
}

const TelegramSession = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<TelegramSession[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  const [destinationType, setDestinationType] = useState<"user" | "group">("user");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Fetch sessions
  const fetchSessions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("telegram_sessions")
        .select("id, phone_number, session_name, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error: any) {
      console.error("Error fetching sessions:", error);
      toast.error("Sessions load করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [user]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const file of Array.from(files)) {
      try {
        // Read file as base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Extract phone number from filename (e.g., 6283840857455.session)
        const fileName = file.name;
        const phoneMatch = fileName.match(/^(\d+)/);
        const phoneNumber = phoneMatch ? phoneMatch[1] : fileName.replace(/\.session$/i, "");

        // Insert into database
        const { error } = await supabase
          .from("telegram_sessions")
          .upsert({
            user_id: user.id,
            phone_number: phoneNumber,
            session_name: fileName,
            session_data: fileData,
            status: "active",
          }, {
            onConflict: "user_id,phone_number",
          });

        if (error) throw error;
        successCount++;
      } catch (error: any) {
        console.error("Error uploading session:", error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount}টি session সফলভাবে যোগ হয়েছে`);
      fetchSessions();
    }
    if (errorCount > 0) {
      toast.error(`${errorCount}টি session যোগ করতে সমস্যা হয়েছে`);
    }

    setUploading(false);
    e.target.value = "";
  };

  // Handle session selection
  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const toggleAllSessions = () => {
    if (selectedSessions.length === sessions.length) {
      setSelectedSessions([]);
    } else {
      setSelectedSessions(sessions.map(s => s.id));
    }
  };

  // Delete session
  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from("telegram_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) throw error;
      toast.success("Session মুছে ফেলা হয়েছে");
      setSelectedSessions(prev => prev.filter(id => id !== sessionId));
      fetchSessions();
    } catch (error: any) {
      console.error("Error deleting session:", error);
      toast.error("Session মুছতে সমস্যা হয়েছে");
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (selectedSessions.length === 0) {
      toast.error("অন্তত একটি session সিলেক্ট করুন");
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
    let successCount = 0;
    let errorCount = 0;

    for (const sessionId of selectedSessions) {
      try {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) continue;

        // Get full session data
        const { data: sessionData, error: fetchError } = await supabase
          .from("telegram_sessions")
          .select("session_data")
          .eq("id", sessionId)
          .single();

        if (fetchError) throw fetchError;

        const { data, error } = await supabase.functions.invoke("telegram-send-message", {
          body: {
            sessionData: sessionData.session_data,
            phoneNumber: session.phone_number,
            destinationType,
            destination: destination.trim(),
            message: message.trim(),
          },
        });

        if (error) throw error;

        if (data?.success) {
          successCount++;
        } else {
          throw new Error(data?.error || "Message পাঠাতে ব্যর্থ");
        }
      } catch (error: any) {
        console.error("Error sending message:", error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount}টি session থেকে message পাঠানো হয়েছে`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount}টি session থেকে message পাঠাতে ব্যর্থ`);
    }

    setSending(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Telegram Session</h1>
            <p className="text-muted-foreground">Telegram session দিয়ে message পাঠান</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {sessions.length}টি Session
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Session Upload
            </CardTitle>
            <CardDescription>
              .session ফাইল আপলোড করুন (Telethon/Pyrogram format)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".session"
                multiple
                onChange={handleFileUpload}
                disabled={uploading}
                className="max-w-md"
              />
              {uploading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sessions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Added Sessions ({sessions.length})
            </CardTitle>
            <CardDescription>
              {selectedSessions.length > 0 && `${selectedSessions.length}টি সিলেক্ট করা হয়েছে`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                কোনো session নেই। উপরে ফাইল আপলোড করুন।
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedSessions.length === sessions.length && sessions.length > 0}
                        onCheckedChange={toggleAllSessions}
                      />
                    </TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Phone Number</TableHead>
                    <TableHead>Session Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-20">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session, index) => (
                    <TableRow key={session.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedSessions.includes(session.id)}
                          onCheckedChange={() => toggleSessionSelection(session.id)}
                        />
                      </TableCell>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono">+{session.phone_number}</TableCell>
                      <TableCell>{session.session_name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={session.status === "active" ? "default" : "destructive"}>
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(session.created_at).toLocaleDateString("bn-BD")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteSession(session.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Message Section */}
        {sessions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send Message
              </CardTitle>
              <CardDescription>
                সিলেক্ট করা session থেকে message পাঠান
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
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
                    placeholder={destinationType === "user" ? "@username অথবা +8801XXXXXXXXX" : "@groupname"}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  placeholder="আপনার message এখানে লিখুন..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                />
              </div>

              <Button
                onClick={handleSendMessage}
                disabled={sending || selectedSessions.length === 0 || !destination.trim() || !message.trim()}
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
                    Send to {selectedSessions.length} Session(s)
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default TelegramSession;
