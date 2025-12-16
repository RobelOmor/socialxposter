-- Create instagram_proxies table
CREATE TABLE public.instagram_proxies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  proxy_host TEXT NOT NULL,
  proxy_port INTEGER NOT NULL,
  proxy_username TEXT,
  proxy_password TEXT,
  proxy_location TEXT,
  status TEXT DEFAULT 'available',
  used_by_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  last_tested_at TIMESTAMPTZ,
  test_result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_proxies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own proxies" ON public.instagram_proxies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proxies" ON public.instagram_proxies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proxies" ON public.instagram_proxies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own proxies" ON public.instagram_proxies
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all proxies" ON public.instagram_proxies
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));