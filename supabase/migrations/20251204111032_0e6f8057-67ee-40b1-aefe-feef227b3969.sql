-- Create photo service categories table
CREATE TABLE public.photo_service_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available')),
  photo_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create photos table for each category
CREATE TABLE public.photo_service_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.photo_service_categories(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(category_id, photo_url)
);

-- Enable RLS
ALTER TABLE public.photo_service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_service_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for photo_service_categories (admin only)
CREATE POLICY "Admins can manage photo service categories" 
ON public.photo_service_categories 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for photo_service_items (admin only)
CREATE POLICY "Admins can manage photo service items" 
ON public.photo_service_items 
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_photo_service_categories_updated_at
BEFORE UPDATE ON public.photo_service_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Function to update photo count and status
CREATE OR REPLACE FUNCTION public.update_category_photo_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.photo_service_categories 
    SET photo_count = photo_count + 1,
        status = 'available'
    WHERE id = NEW.category_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.photo_service_categories 
    SET photo_count = GREATEST(0, photo_count - 1)
    WHERE id = OLD.category_id;
    
    -- Update status to pending if no photos
    UPDATE public.photo_service_categories 
    SET status = 'pending'
    WHERE id = OLD.category_id AND photo_count = 0;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for photo count
CREATE TRIGGER update_category_count_trigger
AFTER INSERT OR DELETE ON public.photo_service_items
FOR EACH ROW
EXECUTE FUNCTION public.update_category_photo_count();