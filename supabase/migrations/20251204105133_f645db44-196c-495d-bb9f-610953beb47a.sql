-- Allow admins to update any profile
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));