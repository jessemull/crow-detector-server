-- Migration: Add image processing fields to feed_event table
-- Date: 2025-08-22

-- Add new enum for processing status
CREATE TYPE processing_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Add new columns to feed_event table
ALTER TABLE feed_event 
ADD COLUMN IF NOT EXISTS s3_bucket VARCHAR(255),
ADD COLUMN IF NOT EXISTS s3_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS processing_status processing_status_enum DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS processing_error TEXT,
ADD COLUMN IF NOT EXISTS moderation_labels TEXT,
ADD COLUMN IF NOT EXISTS face_detected BOOLEAN,
ADD COLUMN IF NOT EXISTS face_bounding_box TEXT,
ADD COLUMN IF NOT EXISTS original_image_size BIGINT,
ADD COLUMN IF NOT EXISTS processed_image_size BIGINT,
ADD COLUMN IF NOT EXISTS processing_duration INTEGER;

-- Create index on processing status for better query performance
CREATE INDEX IF NOT EXISTS idx_feed_event_processing_status ON feed_event(processing_status);

-- Create index on s3 metadata for lookups
CREATE INDEX IF NOT EXISTS idx_feed_event_s3_metadata ON feed_event(s3_bucket, s3_key);

-- Update existing records to have PENDING status
UPDATE feed_event SET processing_status = 'PENDING' WHERE processing_status IS NULL;
