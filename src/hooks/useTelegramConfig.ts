import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TelegramConfig {
  vpsApiUrl: string;
  apiId: string;
  apiHash: string;
  maxSessionsPerUser: number;
  maxMessagesPerDay: number;
  isActive: boolean;
}

export const useTelegramConfig = () => {
  const [config, setConfig] = useState<TelegramConfig>({
    vpsApiUrl: "",
    apiId: "2040",
    apiHash: "b18441a1ff607e10a989891a5462e627",
    maxSessionsPerUser: 100,
    maxMessagesPerDay: 1000,
    isActive: true,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("telegram_admin_config")
        .select("*")
        .limit(1)
        .single();

      if (!error && data) {
        setConfig({
          vpsApiUrl: data.vps_ip ? `http://${data.vps_ip}:8000` : "",
          apiId: data.api_id || "2040",
          apiHash: data.api_hash || "b18441a1ff607e10a989891a5462e627",
          maxSessionsPerUser: data.max_sessions_per_user || 100,
          maxMessagesPerDay: data.max_messages_per_day || 1000,
          isActive: data.is_active ?? true,
        });
      }
    } catch (error) {
      console.error("Failed to fetch telegram config:", error);
    }
    setLoading(false);
  };

  return { config, loading, refetch: fetchConfig };
};
