-- Allow authenticated users to view photo service categories
CREATE POLICY "Authenticated users can view photo service categories"
ON public.photo_service_categories
FOR SELECT
TO authenticated
USING (status = 'available');

-- Allow authenticated users to view photo service items
CREATE POLICY "Authenticated users can view photo service items"
ON public.photo_service_items
FOR SELECT
TO authenticated
USING (true);