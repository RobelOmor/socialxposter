-- Add telegram_name column to store Telegram profile name
ALTER TABLE public.telegram_sessions 
ADD COLUMN telegram_name TEXT;