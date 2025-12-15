-- Create telegram_usernames table for tracking message recipients
CREATE TABLE public.telegram_usernames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  last_session_id UUID REFERENCES public.telegram_sessions(id) ON DELETE SET NULL,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('available', 'used', 'problem'))
);

-- Enable RLS
ALTER TABLE public.telegram_usernames ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own usernames" ON public.telegram_usernames
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usernames" ON public.telegram_usernames
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usernames" ON public.telegram_usernames
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own usernames" ON public.telegram_usernames
  FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_telegram_usernames_user_status ON public.telegram_usernames(user_id, status);
CREATE INDEX idx_telegram_usernames_username ON public.telegram_usernames(user_id, username);