import * as crypto from 'crypto';

// Decode the base64 encoded private key
function decodePrivateKey(base64Key: string | undefined): string | undefined {
  if (!base64Key) {
    return undefined;
  }

  const decoded = Buffer.from(base64Key, 'base64').toString('utf-8');
  const normalizedKey = decoded.replace(/\\n/g, '\n');

  return normalizedKey;
}

const LAMBDA_S3_PRIVATE_KEY = decodePrivateKey(
  process.env.LAMBDA_S3_PRIVATE_KEY,
);

// Function to generate ECDSA signature
function generateSignature(data: string, privateKey: string): string {
  try {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    return sign.sign(privateKey, 'base64');
  } catch (error) {
    console.error('Error generating signature:', error);
    throw new Error(
      `Failed to generate signature: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

// Function to generate authentication headers
export function generateAuthHeaders(
  method: string,
  path: string,
  body: Record<string, unknown>,
): Record<string, string> {
  const timestamp = Date.now().toString();
  const dataToSign = `${method}${path}${JSON.stringify(body)}${timestamp}`;

  if (!LAMBDA_S3_PRIVATE_KEY) {
    throw new Error('LAMBDA_S3_PRIVATE_KEY environment variable not set');
  }

  const signature = generateSignature(dataToSign, LAMBDA_S3_PRIVATE_KEY);

  return {
    'x-device-id': 'lambda-s3',
    'x-signature': signature,
    'x-timestamp': timestamp,
  };
}
