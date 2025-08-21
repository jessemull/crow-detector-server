#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');

require('dotenv').config();

function generatePrivateKey() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256r1',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
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
    throw new Error(`Environment variable ${envKey} not set. Please set it to the path of your private key file.`);
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
      'x-timestamp': timestamp.toString()
    }
  };
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node generate-auth-token.js <method> <path> [body] [device-id]');
    console.log('');
    console.log('Examples:');
    console.log('  node generate-auth-token.js POST /urls/feed \'{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}\'');
    console.log('  node generate-auth-token.js POST /urls/detection \'{"fileName":"detection.jpg","format":"jpg","feedEventId":"123","contentType":"image/jpeg"}\' pi-motion');
    console.log('  node generate-auth-token.js GET /health');
    console.log('');
    console.log('Available device IDs: pi-user, pi-motion, pi-feeder');
    console.log('');
    console.log('Required environment variables:');
    console.log('  PI_USER_PRIVATE_KEY_PATH - Path to pi-user private key file');
    console.log('  PI_MOTION_PRIVATE_KEY_PATH - Path to pi-motion private key file');
    console.log('  PI_FEEDER_PRIVATE_KEY_PATH - Path to pi-feeder private key file');
    return;
  }
  
  const method = args[0];
  const path = args[1];
  const body = args[2] ? JSON.parse(args[2]) : {};
  const deviceId = args[3] || 'pi-user';
  
  try {
    const auth = generateAuthToken(method, path, body, deviceId);
    
    console.log('\n=== Authentication Token Generated ===');
    console.log(`Device ID: ${deviceId}`);
    console.log(`Method: ${method}`);
    console.log(`Path: ${path}`);
    console.log(`Body: ${JSON.stringify(body)}`);
    console.log(`Timestamp: ${auth.timestamp}`);
    console.log(`Data to sign: ${auth.dataToSign}`);
    console.log(`Signature: ${auth.signature}`);
    
    console.log('\n=== cURL Headers ===');
    console.log(`-H "x-device-id: ${auth.headers['x-device-id']}"`);
    console.log(`-H "x-signature: ${auth.headers['x-signature']}"`);
    console.log(`-H "x-timestamp: ${auth.headers['x-timestamp']}"`);
    
    console.log('\n=== Full cURL Example ===');
    const bodyArg = Object.keys(body).length > 0 ? `-d '${JSON.stringify(body)}'` : '';
    console.log(`curl -X ${method} https://api-dev.crittercanteen.com${path} ${bodyArg} \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "x-device-id: ${auth.headers['x-device-id']}" \\`);
    console.log(`  -H "x-signature: ${auth.headers['x-signature']}" \\`);
    console.log(`  -H "x-timestamp: ${auth.headers['x-timestamp']}"`);
    
  } catch (error) {
    console.error('Error generating auth token:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateAuthToken, generatePrivateKey, generateSignature };
