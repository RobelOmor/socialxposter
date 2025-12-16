-- Performance indexes for large scale Instagram operations

-- instagram_accounts indexes
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_status ON public.instagram_accounts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_created ON public.instagram_accounts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_batch ON public.instagram_accounts(batch_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_batch ON public.instagram_accounts(user_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_status ON public.instagram_accounts(status);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_last_posted ON public.instagram_accounts(last_posted_at);

-- instagram_proxies indexes
CREATE INDEX IF NOT EXISTS idx_instagram_proxies_user_status ON public.instagram_proxies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_instagram_proxies_status ON public.instagram_proxies(status);
CREATE INDEX IF NOT EXISTS idx_instagram_proxies_used_by ON public.instagram_proxies(used_by_account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_proxies_available ON public.instagram_proxies(user_id, status) WHERE status = 'available';

-- account_batches indexes
CREATE INDEX IF NOT EXISTS idx_account_batches_user ON public.account_batches(user_id);

-- photo_service_items indexes for bulk posting
CREATE INDEX IF NOT EXISTS idx_photo_service_items_category ON public.photo_service_items(category_id);
CREATE INDEX IF NOT EXISTS idx_photo_service_categories_status ON public.photo_service_categories(status);