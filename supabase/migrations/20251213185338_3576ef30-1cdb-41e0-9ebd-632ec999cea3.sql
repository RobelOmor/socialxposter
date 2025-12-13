-- Create telegram_admin_config table to store VPS and API settings
CREATE TABLE public.telegram_admin_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vps_ip TEXT,
  api_id TEXT DEFAULT '2040',
  api_hash TEXT DEFAULT 'b18441a1ff607e10a989891a5462e627',
  max_sessions_per_user INTEGER DEFAULT 100,
  max_messages_per_day INTEGER DEFAULT 1000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_admin_config ENABLE ROW LEVEL SECURITY;

-- Only admins can manage config
CREATE POLICY "Admins can manage telegram config" 
ON public.telegram_admin_config 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can read config (to get VPS URL)
CREATE POLICY "Authenticated users can read telegram config" 
ON public.telegram_admin_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Insert default config row
INSERT INTO public.telegram_admin_config (id) VALUES (gen_random_uuid());

-- Create trigger for updated_at
CREATE TRIGGER update_telegram_admin_config_updated_at
BEFORE UPDATE ON public.telegram_admin_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();