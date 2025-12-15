import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TelegramProxy {
  id: string;
  proxy_host: string;
  proxy_port: number;
  proxy_username: string | null;
  proxy_password: string | null;
  status: string;
  used_by_session_id: string | null;
  created_at: string;
}

export const useTelegramProxies = () => {
  const { user } = useAuth();
  const [proxies, setProxies] = useState<TelegramProxy[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProxies = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_proxies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setProxies(data as TelegramProxy[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const availableProxies = proxies.filter(p => p.status === "available");

  const markProxyAsUsed = async (proxyId: string, sessionId: string) => {
    const { error } = await supabase
      .from("telegram_proxies")
      .update({ 
        status: "used", 
        used_by_session_id: sessionId,
        updated_at: new Date().toISOString()
      })
      .eq("id", proxyId);

    if (!error) {
      await fetchProxies();
    }
    return !error;
  };

  const releaseProxy = async (proxyId: string) => {
    const { error } = await supabase
      .from("telegram_proxies")
      .update({ 
        status: "available", 
        used_by_session_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", proxyId);

    if (!error) {
      await fetchProxies();
    }
    return !error;
  };

  return {
    proxies,
    availableProxies,
    loading,
    fetchProxies,
    markProxyAsUsed,
    releaseProxy,
  };
};
