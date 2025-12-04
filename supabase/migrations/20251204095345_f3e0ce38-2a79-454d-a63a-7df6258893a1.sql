-- Add bio column to instagram_accounts table
ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS bio text;