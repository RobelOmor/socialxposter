-- Create table for Telegram sessions
CREATE TABLE public.telegram_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone_number TEXT NOT NULL,
  session_name TEXT,
  session_data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone_number)
);

-- Enable RLS
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own telegram sessions"
ON public.telegram_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own telegram sessions"
ON public.telegram_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram sessions"
ON public.telegram_sessions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own telegram sessions"
ON public.telegram_sessions
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_telegram_sessions_updated_at
BEFORE UPDATE ON public.telegram_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();