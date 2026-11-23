-- Apply once against the API database before serving feeder routes.
-- The ECS image deploy does not run this file, and TypeORM synchronize stays off.
-- Enum name matches TypeORM's default for DispenseRequest.status.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispense_request_status_enum') THEN
    CREATE TYPE dispense_request_status_enum AS ENUM ('requested', 'recording', 'ready', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS dispense_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status dispense_request_status_enum NOT NULL DEFAULT 'requested',
  "proofKey" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feeder_visit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "videoKey" varchar NOT NULL,
  "animalCount" integer NOT NULL,
  "crowCount" integer NOT NULL DEFAULT 0,
  "detectedAnimals" json,
  "dispenseRequestId" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispense_request_created_at_idx
  ON dispense_request ("createdAt");

CREATE INDEX IF NOT EXISTS dispense_request_status_created_idx
  ON dispense_request (status, "createdAt");
