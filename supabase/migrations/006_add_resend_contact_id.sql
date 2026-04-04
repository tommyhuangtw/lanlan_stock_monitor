-- Add resend_contact_id to users table for Resend Audience sync
ALTER TABLE users ADD COLUMN IF NOT EXISTS resend_contact_id TEXT;
