/** Matches the feeder/ object lifecycle in the S3 template. */
export const FEEDER_CLIP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function feederClipStillStored(
  createdAt: Date,
  now = Date.now(),
): boolean {
  return now - createdAt.getTime() < FEEDER_CLIP_RETENTION_MS;
}
