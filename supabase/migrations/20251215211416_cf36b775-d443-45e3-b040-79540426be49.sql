-- Create table for Telegram session filters/labels
CREATE TABLE public.telegram_session_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_session_filters ENABLE ROW LEVEL SECURITY;

-- RLS policies for telegram_session_filters
CREATE POLICY "Users can view own filters" 
ON public.telegram_session_filters 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own filters" 
ON public.telegram_session_filters 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own filters" 
ON public.telegram_session_filters 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own filters" 
ON public.telegram_session_filters 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add filter_id column to telegram_sessions
ALTER TABLE public.telegram_sessions 
ADD COLUMN filter_id UUID REFERENCES public.telegram_session_filters(id) ON DELETE SET NULL;

-- Create index for faster filtering
CREATE INDEX idx_telegram_sessions_filter_id ON public.telegram_sessions(filter_id);