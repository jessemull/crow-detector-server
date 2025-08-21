# Scripts

This directory contains utility scripts for the crow-detector-server.

## Authentication Token Generation

### `generate-auth-token.js`

Generates valid ECDSA authentication tokens for testing protected endpoints.

#### Usage

```bash
# Basic usage
npm run auth:token <method> <path> [body] [device-id]

# Examples
npm run auth:token POST /urls/feed '{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}'
npm run auth:token POST /urls/detection '{"fileName":"detection.jpg","format":"jpg","feedEventId":"123","contentType":"image/jpeg"}' pi-motion
npm run auth:token GET /health
```

#### Parameters

- `method`: HTTP method (GET, POST, PATCH, etc.)
- `path`: API endpoint path (e.g., /urls/feed)
- `body`: JSON body for POST/PATCH requests (optional)
- `device-id`: Device identifier (pi-user, pi-motion, pi-feeder) - defaults to pi-user

#### How it works

1. **Key Loading**: Reads private keys from file paths specified in environment variables
2. **Signature Creation**: Creates a signature from `${method}${path}${body}${timestamp}`
3. **Token Output**: Provides all necessary headers and a complete cURL example

#### Key Management

- Private keys are stored in files specified by environment variables
- You must provide the paths to your existing private key files
- No automatic key generation - you maintain full control over your keys

#### Example Output

```
=== Authentication Token Generated ===
Device ID: pi-user
Method: POST
Path: /urls/feed
Body: {"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}
Timestamp: 1703123456789
Data to sign: POST/urls/feed{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}1703123456789
Signature: MEUCIQ...

=== cURL Headers ===
-H "x-device-id: pi-user"
-H "x-signature: MEUCIQ..."
-H "x-timestamp: 1703123456789"

=== Full cURL Example ===
curl -X POST https://api-dev.crittercanteen.com/urls/feed -d '{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}' \
  -H "Content-Type: application/json" \
  -H "x-device-id: pi-user" \
  -H "x-signature: MEUCIQ..." \
  -H "x-timestamp: 1703123456789"
```

#### Setup

1. **Create private key files** for each device type (pi-user, pi-motion, pi-feeder)
2. **Set environment variables** in your `.env` file:
   ```
   PI_USER_PRIVATE_KEY_PATH=/path/to/pi-user-private.pem
   PI_MOTION_PRIVATE_KEY_PATH=/path/to/pi-motion-private.pem
   PI_FEEDER_PRIVATE_KEY_PATH=/path/to/pi-feeder-private.pem
   ```
3. **Set public keys** in your `.env` file (for the server to verify signatures):
   ```
   PI_USER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   PI_MOTION_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   PI_FEEDER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   ```

#### Testing Endpoints

1. **Generate token**: `npm run auth:token POST /urls/feed '{"fileName":"test.jpg","format":"jpg","source":"motion","contentType":"image/jpeg"}'`
2. **Copy the cURL command** from the output
3. **Run the cURL command** to test your endpoint

#### Security Notes

- Private keys are stored in files you specify and should never be committed to git
- Each device type gets its own key pair
- Timestamps prevent replay attacks (5-minute window)
- You maintain full control over key generation and management
