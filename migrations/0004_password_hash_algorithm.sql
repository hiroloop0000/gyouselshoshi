-- Existing rows retain their original single-pass PBKDF2 marker; new writes set the split scheme explicitly.
ALTER TABLE users
  ADD COLUMN password_algorithm TEXT NOT NULL DEFAULT 'PBKDF2_SHA256';
