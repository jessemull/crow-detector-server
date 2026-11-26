-- Hand-applied drop for the unused still-photo pipeline.
-- Do not enable TypeORM synchronize. Do not drop feeder or porch tables.
-- Order matters: detection_event references feed_event.

DROP TABLE IF EXISTS detection_event;
DROP TABLE IF EXISTS feed_event;
