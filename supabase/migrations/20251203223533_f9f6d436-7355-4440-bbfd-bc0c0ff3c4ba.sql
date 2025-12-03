-- Update default account_limit for free users to 1000
ALTER TABLE public.profiles ALTER COLUMN account_limit SET DEFAULT 1000;

-- Update existing free plan users to have 1000 limit
UPDATE public.profiles SET account_limit = 1000 WHERE subscription_plan = 'free';

-- Update existing premium plan users to have unlimited (null represents unlimited)
UPDATE public.profiles SET account_limit = NULL WHERE subscription_plan = 'premium';