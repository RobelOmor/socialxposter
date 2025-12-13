import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, Trash2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AutoReply {
  id: string;
  name: string;
  trigger_keywords: string[];
  reply_template: string;
  is_active: boolean;
}

export const AutoReplyConfig = () => {
  const { toast } = useToast();
  const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newReply, setNewReply] = useState({
    name: "",
    keywords: "",
    template: "",
  });

  const fetchAutoReplies = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("telegram_auto_replies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching auto replies:", error);
    } else {
      setAutoReplies(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAutoReplies();
  }, []);

  const handleCreate = async () => {
    if (!newReply.name || !newReply.keywords || !newReply.template) {
      toast({ title: "Error", description: "Fill all fields", variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const keywords = newReply.keywords.split(",").map((k) => k.trim().toLowerCase());

    const { error } = await supabase.from("telegram_auto_replies").insert({
      user_id: user.id,
      name: newReply.name,
      trigger_keywords: keywords,
      reply_template: newReply.template,
      is_active: true,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to create auto-reply", variant: "destructive" });
    } else {
      toast({ title: "Created", description: "Auto-reply rule added" });
      setNewReply({ name: "", keywords: "", template: "" });
      setShowForm(false);
      fetchAutoReplies();
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const { error } = await supabase
      .from("telegram_auto_replies")
      .update({ is_active: !isActive })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    } else {
      fetchAutoReplies();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("telegram_auto_replies").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Auto-reply removed" });
      fetchAutoReplies();
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Bot className="h-5 w-5" />
          Auto-Reply Rules ({autoReplies.length})
        </CardTitle>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="p-4 bg-background rounded-lg border border-border space-y-3">
            <div>
              <Label className="text-muted-foreground">Rule Name</Label>
              <Input
                placeholder="e.g., Welcome Response"
                value={newReply.name}
                onChange={(e) => setNewReply({ ...newReply, name: e.target.value })}
                className="bg-muted mt-1"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Trigger Keywords (comma separated)</Label>
              <Input
                placeholder="hello, hi, hey, start"
                value={newReply.keywords}
                onChange={(e) => setNewReply({ ...newReply, keywords: e.target.value })}
                className="bg-muted mt-1"
              />
            </div>
            <div>
              <Label className="text-muted-foreground">Reply Template</Label>
              <Textarea
                placeholder="Hello! Thanks for reaching out. How can I help you?"
                value={newReply.template}
                onChange={(e) => setNewReply({ ...newReply, template: e.target.value })}
                rows={3}
                className="bg-muted mt-1"
              />
              <span className="text-xs text-muted-foreground">
                Use {"{name}"} for sender's name
              </span>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate}>
                <Save className="h-4 w-4 mr-1" />
                Save Rule
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {autoReplies.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No auto-reply rules configured</p>
          ) : (
            autoReplies.map((rule) => (
              <div
                key={rule.id}
                className="p-3 bg-background rounded-lg border border-border space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{rule.name}</span>
                    <Badge
                      className={
                        rule.is_active
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30"
                      }
                    >
                      {rule.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggle(rule.id, rule.is_active)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {rule.trigger_keywords.map((keyword, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground truncate">{rule.reply_template}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
