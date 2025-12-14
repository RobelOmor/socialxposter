-- Update telegram admin config to use ngrok URL instead of VPS
UPDATE telegram_admin_config 
SET vps_ip = '5a63d1dd97c6.ngrok-free.app',
    updated_at = now()
WHERE id = (SELECT id FROM telegram_admin_config LIMIT 1);

-- If no config exists, insert one
INSERT INTO telegram_admin_config (vps_ip, api_id, api_hash, is_active)
SELECT '5a63d1dd97c6.ngrok-free.app', '2040', 'b18441a1ff607e10a989891a5462e627', true
WHERE NOT EXISTS (SELECT 1 FROM telegram_admin_config);