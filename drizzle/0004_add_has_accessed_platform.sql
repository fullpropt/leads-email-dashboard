-- Migration: Add has_accessed_platform column to leads table
-- This column tracks whether a lead has registered/accessed the TubeTools platform

ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS has_accessed_platform INTEGER DEFAULT 0;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_has_accessed_platform 
ON leads(has_accessed_platform);

-- Add comment to explain the column
COMMENT ON COLUMN leads.has_accessed_platform IS 'Indicates if the lead has registered/accessed the TubeTools platform (0 = not accessed, 1 = accessed)';
