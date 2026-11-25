#!/usr/bin/env ts-node

import * as crypto from 'crypto';
import * as fs from 'fs';
import { config } from 'dotenv';
import { createLogger } from '../src/common/logger/logger.config';

config();

function generatePrivateKey() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256r1',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { privateKey, publicKey };
}

function generateSignature(data: string, privateKey: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  return sign.sign(privateKey, 'base64');
}

function generateAuthToken(
  method: string,
  path: string,
  body: object = {},
  deviceId = 'pi-user',
) {
  const timestamp = Date.now();
  const dataToSign = `${method}${path}${JSON.stringify(body)}${timestamp}`;

  const envKey = `${deviceId.toUpperCase().replace('-', '_')}_PRIVATE_KEY_PATH`;
  const privateKeyPath = process.env[envKey];

  if (!privateKeyPath) {
    throw new Error(
      `Environment variable ${envKey} not set. Please set it to the path of your private key file.`,
    );
  }

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`Private key file not found at: ${privateKeyPath}`);
  }

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const signature = generateSignature(dataToSign, privateKey);

  return {
    timestamp,
    signature,
    dataToSign,
    headers: {
      'x-device-id': deviceId,
      'x-signature': signature,
      'x-timestamp': timestamp.toString(),
    },
  };
}

function parseBody(raw: string | undefined): object {
  if (!raw) {
    return {};
  }

  const parsed: unknown = JSON.parse(raw);

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Body must be a JSON object');
  }

  return parsed;
}

function main() {
  const logger = createLogger('GenerateAuthToken');
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.info(
      'Usage: ts-node generate-auth-token.ts <method> <path> [body] [device-id]',
    );
    logger.info('Examples:');
    logger.info(
      '  ts-node generate-auth-token.ts POST /urls/feed \'{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}\'',
    );
    logger.info(
      '  ts-node generate-auth-token.ts POST /urls/detection \'{"fileName":"detection.jpg","format":"jpg","feedEventId":"123","contentType":"image/jpeg"}\' pi-motion',
    );
    logger.info('  ts-node generate-auth-token.ts GET /health');
    logger.info(
      'Available device IDs: pi-user, pi-motion, pi-feeder, pi-porch',
    );
    logger.info('Required environment variables:');
    logger.info(
      '  PI_USER_PRIVATE_KEY_PATH - Path to pi-user private key file',
    );
    logger.info(
      '  PI_MOTION_PRIVATE_KEY_PATH - Path to pi-motion private key file',
    );
    logger.info(
      '  PI_FEEDER_PRIVATE_KEY_PATH - Path to pi-feeder private key file',
    );
    logger.info(
      '  PI_PORCH_PRIVATE_KEY_PATH - Path to pi-porch private key file',
    );
    return;
  }

  const method = args[0];
  const path = args[1];

  if (!method || path === undefined) {
    logger.error('Method and path are required');
    process.exit(1);
  }

  const body = parseBody(args[2]);
  const deviceId = args[3] || 'pi-user';

  try {
    const auth = generateAuthToken(method, path, body, deviceId);

    logger.info('\n=== Authentication Token Generated ===');
    logger.info(`Device ID: ${deviceId}`);
    logger.info(`Method: ${method}`);
    logger.info(`Path: ${path}`);
    logger.info(`Timestamp: ${auth.timestamp}`);

    const bodyArg =
      Object.keys(body).length > 0
        ? `-d ${shellSingleQuote(JSON.stringify(body))}`
        : '';
    const curl = [
      `curl -X ${shellSingleQuote(method)} ${shellSingleQuote(`https://api-dev.crittercanteen.com${path}`)} ${bodyArg}`,
      `-H ${shellSingleQuote('Content-Type: application/json')}`,
      `-H ${shellSingleQuote(`x-device-id: ${auth.headers['x-device-id']}`)}`,
      `-H ${shellSingleQuote(`x-signature: ${auth.headers['x-signature']}`)}`,
      `-H ${shellSingleQuote(`x-timestamp: ${auth.headers['x-timestamp']}`)}`,
    ].join(' \\\n  ');
    process.stdout.write(`${curl}\n`);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error generating auth token',
    );
    process.exit(1);
  }
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

if (require.main === module) {
  main();
}

module.exports = { generateAuthToken, generatePrivateKey, generateSignature };
