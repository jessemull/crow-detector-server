import { readFileSync } from 'fs';
import { join } from 'path';

export interface RdsSslOptions {
  ca?: string;
  rejectUnauthorized: boolean;
}

/**
 * Amazon's database authority is not in Node's default trust list.
 * The published bundle is public, and the connection still rejects any
 * certificate that Amazon did not sign.
 */
export function loadRdsCaCertificate(): string {
  return readFileSync(
    join(process.cwd(), 'certs/rds-global-bundle.pem'),
    'utf8',
  );
}

export function buildRdsSslOptions(rejectUnauthorized: boolean): RdsSslOptions {
  if (!rejectUnauthorized) {
    return { rejectUnauthorized: false };
  }

  return {
    ca: loadRdsCaCertificate(),
    rejectUnauthorized: true,
  };
}
