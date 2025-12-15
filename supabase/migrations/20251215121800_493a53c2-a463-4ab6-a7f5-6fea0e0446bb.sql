-- Create telegram_proxies table for storing user proxies
CREATE TABLE public.telegram_proxies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  proxy_host TEXT NOT NULL,
  proxy_port INTEGER NOT NULL,
  proxy_username TEXT,
  proxy_password TEXT,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'used')),
  used_by_session_id UUID REFERENCES public.telegram_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_proxies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own proxies"
ON public.telegram_proxies FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own proxies"
ON public.telegram_proxies FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own proxies"
ON public.telegram_proxies FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own proxies"
ON public.telegram_proxies FOR DELETE
USING (auth.uid() = user_id);