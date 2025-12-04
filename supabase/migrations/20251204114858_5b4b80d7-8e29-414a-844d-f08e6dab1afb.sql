-- Allow authenticated users to delete photo service items (after posting)
CREATE POLICY "Authenticated users can delete photo service items"
ON public.photo_service_items
FOR DELETE
TO authenticated
USING (true);