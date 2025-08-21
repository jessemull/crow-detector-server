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

function generateSignature(data, privateKey) {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  return sign.sign(privateKey, 'base64');
}

function generateAuthToken(method, path, body = {}, deviceId = 'pi-user') {
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
    logger.info('Available device IDs: pi-user, pi-motion, pi-feeder');
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
    return;
  }

  const method = args[0];
  const path = args[1];
  const body = args[2] ? JSON.parse(args[2]) : {};
  const deviceId = args[3] || 'pi-user';

  try {
    const auth = generateAuthToken(method, path, body, deviceId);

    logger.info('\n=== Authentication Token Generated ===');
    logger.info(`Device ID: ${deviceId}`);
    logger.info(`Method: ${method}`);
    logger.info(`Path: ${path}`);
    logger.info(`Body: ${JSON.stringify(body)}`);
    logger.info(`Timestamp: ${auth.timestamp}`);
    logger.info(`Data to sign: ${auth.dataToSign}`);
    logger.info(`Signature: ${auth.signature}`);

    logger.info('\n=== cURL Headers ===');
    logger.info(`-H "x-device-id: ${auth.headers['x-device-id']}"`);
    logger.info(`-H "x-signature: ${auth.headers['x-signature']}"`);
    logger.info(`-H "x-timestamp: ${auth.headers['x-timestamp']}"`);

    logger.info('\n=== Full cURL Example ===');

    const bodyArg =
      Object.keys(body).length > 0 ? `-d '${JSON.stringify(body)}'` : '';

    logger.info(
      `curl -X ${method} https://api-dev.crittercanteen.com${path} ${bodyArg} \\`,
    );
    logger.info(`  -H "Content-Type: application/json" \\`);
    logger.info(`  -H "x-device-id: ${auth.headers['x-device-id']}" \\`);
    logger.info(`  -H "x-signature: ${auth.headers['x-signature']}" \\`);
    logger.info(`  -H "x-timestamp: ${auth.headers['x-timestamp']}"`);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error generating auth token',
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateAuthToken, generatePrivateKey, generateSignature };
