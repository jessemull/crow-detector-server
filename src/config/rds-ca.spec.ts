import { X509Certificate } from 'crypto';
import { buildRdsSslOptions, loadRdsCaCertificate } from './rds-ca';

function certificateSubjects(bundle: string): string[] {
  return bundle
    .split('-----END CERTIFICATE-----')
    .map((part) => part.trim())
    .filter((part) => part.includes('BEGIN CERTIFICATE'))
    .map(
      (part) =>
        new X509Certificate(`${part}\n-----END CERTIFICATE-----\n`).subject,
    );
}

describe('RDS certificate', () => {
  it('loads Amazon’s published database certificates', () => {
    const subjects = certificateSubjects(loadRdsCaCertificate());

    expect(subjects.join('\n')).toContain(
      'Amazon RDS us-west-2 Root CA RSA2048 G1',
    );
  });

  it('gives the database connection Amazon’s certificate when verification is on', () => {
    const ssl = buildRdsSslOptions(true);

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(certificateSubjects(ssl.ca ?? '').join('\n')).toContain(
      'Amazon RDS us-west-2 Root CA RSA2048 G1',
    );
  });

  it('skips verification only when the opt-out is on', () => {
    expect(buildRdsSslOptions(false)).toEqual({ rejectUnauthorized: false });
  });
});
