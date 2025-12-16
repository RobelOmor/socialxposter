-- Add safety tracking fields to instagram_accounts
ALTER TABLE public.instagram_accounts 
ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS posts_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS posts_today_date DATE DEFAULT NULL;

-- Add accounts_using_count to instagram_proxies for tracking
ALTER TABLE public.instagram_proxies 
ADD COLUMN IF NOT EXISTS accounts_count INTEGER DEFAULT 0;

-- Update accounts_count based on current usage
UPDATE public.instagram_proxies 
SET accounts_count = (
  SELECT COUNT(*) 
  FROM public.instagram_accounts 
  WHERE instagram_accounts.id = instagram_proxies.used_by_account_id
)
WHERE used_by_account_id IS NOT NULL;