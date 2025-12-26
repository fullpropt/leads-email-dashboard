-- Add selected_for_manual_send column to leads table
ALTER TABLE "leads" ADD COLUMN "selected_for_manual_send" integer DEFAULT 0 NOT NULL;