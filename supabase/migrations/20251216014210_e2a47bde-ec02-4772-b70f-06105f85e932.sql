-- Add instagram_vps_ip column to telegram_admin_config
ALTER TABLE public.telegram_admin_config 
ADD COLUMN instagram_vps_ip TEXT;