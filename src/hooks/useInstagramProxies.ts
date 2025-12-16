import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InstagramProxy {
  id: string;
  proxy_host: string;
  proxy_port: number;
  proxy_username: string | null;
  proxy_password: string | null;
  status: string | null;
  used_by_account_id: string | null;
  created_at: string | null;
}

export const useInstagramProxies = () => {
  const { user } = useAuth();
  const [proxies, setProxies] = useState<InstagramProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);

  const fetchProxies = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch total count using count query (no row limit)
    const { count: total } = await supabase
      .from("instagram_proxies")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Fetch available count using count query
    const { count: available } = await supabase
      .from("instagram_proxies")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "available")
      .is("used_by_account_id", null);

    setTotalCount(total || 0);
    setAvailableCount(available || 0);

    // Fetch limited proxies for display (last 100 for UI)
    const { data, error } = await supabase
      .from("instagram_proxies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && data) {
      setProxies(data as InstagramProxy[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const availableProxies = proxies.filter(p => p.status === "available" && !p.used_by_account_id);

  return {
    proxies,
    availableProxies,
    availableCount,
    totalCount,
    loading,
    fetchProxies,
  };
};
