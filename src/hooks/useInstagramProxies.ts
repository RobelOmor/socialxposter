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

  const fetchProxies = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("instagram_proxies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

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
    availableCount: availableProxies.length,
    totalCount: proxies.length,
    loading,
    fetchProxies,
  };
};
