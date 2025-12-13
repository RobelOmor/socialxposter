-- Add proxy and messaging columns to telegram_sessions
ALTER TABLE public.telegram_sessions 
ADD COLUMN IF NOT EXISTS proxy_host TEXT,
ADD COLUMN IF NOT EXISTS proxy_port INTEGER,
ADD COLUMN IF NOT EXISTS proxy_username TEXT,
ADD COLUMN IF NOT EXISTS proxy_password TEXT,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS messages_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS replies_received INTEGER DEFAULT 0;

-- Create telegram_messages table for tracking sent messages
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.telegram_sessions(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  destination_type TEXT NOT NULL DEFAULT 'user',
  message_content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create telegram_replies table for tracking replies
CREATE TABLE IF NOT EXISTS public.telegram_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES public.telegram_sessions(id) ON DELETE CASCADE,
  from_user TEXT NOT NULL,
  from_user_id TEXT,
  message_content TEXT NOT NULL,
  replied BOOLEAN DEFAULT false,
  reply_content TEXT,
  replied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create telegram_auto_replies table for auto-reply templates
CREATE TABLE IF NOT EXISTS public.telegram_auto_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger_keywords TEXT[],
  reply_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_auto_replies ENABLE ROW LEVEL SECURITY;

-- RLS policies for telegram_messages
CREATE POLICY "Users can view own messages" ON public.telegram_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages" ON public.telegram_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own messages" ON public.telegram_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own messages" ON public.telegram_messages FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for telegram_replies
CREATE POLICY "Users can view own replies" ON public.telegram_replies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own replies" ON public.telegram_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own replies" ON public.telegram_replies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own replies" ON public.telegram_replies FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for telegram_auto_replies
CREATE POLICY "Users can view own auto replies" ON public.telegram_auto_replies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own auto replies" ON public.telegram_auto_replies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own auto replies" ON public.telegram_auto_replies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own auto replies" ON public.telegram_auto_replies FOR DELETE USING (auth.uid() = user_id);