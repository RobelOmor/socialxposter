-- Create subscription_history table for tracking package changes
CREATE TABLE public.subscription_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  previous_plan subscription_plan,
  new_plan subscription_plan NOT NULL,
  previous_limit INTEGER,
  new_limit INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expire_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

-- Admins can manage all history
CREATE POLICY "Admins can manage subscription history"
ON public.subscription_history
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own history
CREATE POLICY "Users can view own subscription history"
ON public.subscription_history
FOR SELECT
USING (auth.uid() = user_id);

-- Add index for faster queries
CREATE INDEX idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX idx_subscription_history_created_at ON public.subscription_history(created_at DESC);