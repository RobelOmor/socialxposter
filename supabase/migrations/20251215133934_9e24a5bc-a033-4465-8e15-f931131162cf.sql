-- Delete duplicate usernames, keep only the first entry (by created_at)
DELETE FROM telegram_usernames
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, LOWER(username)) id
  FROM telegram_usernames
  ORDER BY user_id, LOWER(username), created_at ASC
);

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS telegram_usernames_user_username_unique 
ON telegram_usernames (user_id, LOWER(username));