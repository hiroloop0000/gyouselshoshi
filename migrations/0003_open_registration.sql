INSERT INTO app_settings (setting_key, setting_value, value_type, description)
VALUES ('registration_mode', 'OPEN', 'STRING', '新規登録モード（OPEN または INVITE_ONLY）')
ON CONFLICT(setting_key) DO UPDATE SET
  setting_value = 'OPEN',
  value_type = 'STRING',
  description = excluded.description,
  updated_at = CURRENT_TIMESTAMP;

UPDATE app_settings
SET description = '有効ユーザー上限', updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'max_active_users';
