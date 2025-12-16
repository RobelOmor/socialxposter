-- Add 711proxy configuration fields to telegram_admin_config table
ALTER TABLE public.telegram_admin_config 
ADD COLUMN IF NOT EXISTS proxy_711_host TEXT DEFAULT 'global.rotgb.711proxy.com',
ADD COLUMN IF NOT EXISTS proxy_711_port INTEGER DEFAULT 10000,
ADD COLUMN IF NOT EXISTS proxy_711_username TEXT DEFAULT 'robel4-zone-custom-region-BD';

-- Update existing row with default values if exists
UPDATE public.telegram_admin_config 
SET 
  proxy_711_host = COALESCE(proxy_711_host, 'global.rotgb.711proxy.com'),
  proxy_711_port = COALESCE(proxy_711_port, 10000),
  proxy_711_username = COALESCE(proxy_711_username, 'robel4-zone-custom-region-BD')
WHERE id IS NOT NULL;