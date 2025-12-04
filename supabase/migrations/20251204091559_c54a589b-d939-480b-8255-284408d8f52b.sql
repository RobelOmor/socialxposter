-- Create account_batches table for batch management
CREATE TABLE public.account_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add batch_id column to instagram_accounts
ALTER TABLE public.instagram_accounts
ADD COLUMN batch_id UUID REFERENCES public.account_batches(id) ON DELETE SET NULL;

-- Enable RLS on account_batches
ALTER TABLE public.account_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for account_batches
CREATE POLICY "Users can view own batches"
ON public.account_batches
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own batches"
ON public.account_batches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own batches"
ON public.account_batches
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own batches"
ON public.account_batches
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all batches"
ON public.account_batches
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_account_batches_updated_at
BEFORE UPDATE ON public.account_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();