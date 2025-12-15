import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TelegramUsername {
  id: string;
  username: string;
  status: string;
  last_session_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface UsernameStats {
  total: number;
  available: number;
  used: number;
  problem: number;
}

export const useTelegramUsernames = () => {
  const { user } = useAuth();
  const [usernames, setUsernames] = useState<TelegramUsername[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UsernameStats>({ total: 0, available: 0, used: 0, problem: 0 });

  const fetchUsernames = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_usernames")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setUsernames(data as TelegramUsername[]);
      
      // Calculate stats
      const total = data.length;
      const available = data.filter(u => u.status === "available").length;
      const used = data.filter(u => u.status === "used").length;
      const problem = data.filter(u => u.status === "problem").length;
      setStats({ total, available, used, problem });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchUsernames();
  }, [fetchUsernames]);

  const addUsernames = async (usernameList: string[]) => {
    if (!user) return { success: false, inserted: 0, duplicates: 0 };
    
    const uniqueUsernames = [...new Set(usernameList.map(u => u.trim().replace('@', '')).filter(u => u.length > 0))];
    
    // Get existing usernames
    const { data: existing } = await supabase
      .from("telegram_usernames")
      .select("username")
      .eq("user_id", user.id);
    
    const existingSet = new Set((existing || []).map(e => e.username.toLowerCase()));
    const newUsernames = uniqueUsernames.filter(u => !existingSet.has(u.toLowerCase()));
    const duplicates = uniqueUsernames.length - newUsernames.length;
    
    if (newUsernames.length > 0) {
      const toInsert = newUsernames.map(username => ({
        user_id: user.id,
        username,
        status: "available"
      }));
      
      const { error } = await supabase
        .from("telegram_usernames")
        .insert(toInsert);
      
      if (error) {
        return { success: false, inserted: 0, duplicates };
      }
    }
    
    await fetchUsernames();
    return { success: true, inserted: newUsernames.length, duplicates };
  };

  const updateUsernameStatus = async (id: string, status: string, errorMessage?: string) => {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (status === "used") {
      updateData.sent_at = new Date().toISOString();
    }
    
    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }
    
    const { error } = await supabase
      .from("telegram_usernames")
      .update(updateData)
      .eq("id", id);
    
    if (!error) {
      await fetchUsernames();
    }
    return !error;
  };

  const deleteUsername = async (id: string) => {
    const { error } = await supabase
      .from("telegram_usernames")
      .delete()
      .eq("id", id);
    
    if (!error) {
      await fetchUsernames();
    }
    return !error;
  };

  const resetUsernames = async (ids: string[]) => {
    const { error } = await supabase
      .from("telegram_usernames")
      .update({ status: "available", error_message: null, sent_at: null, updated_at: new Date().toISOString() })
      .in("id", ids);
    
    if (!error) {
      await fetchUsernames();
    }
    return !error;
  };

  const getAvailableUsernames = () => usernames.filter(u => u.status === "available");

  return {
    usernames,
    stats,
    loading,
    fetchUsernames,
    addUsernames,
    updateUsernameStatus,
    deleteUsername,
    resetUsernames,
    getAvailableUsernames,
  };
};
