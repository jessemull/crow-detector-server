import * as crypto from 'crypto';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { logger } from 'src/common/logger/logger.config';

@Injectable()
export class EcdsaAuthGuard implements CanActivate {
  private readonly devicePublicKeys: Record<string, string | undefined>;

  constructor() {
    this.devicePublicKeys = {
      'pi-user': this.decodePublicKey(process.env.PI_USER_PUBLIC_KEY),
      'pi-motion': this.decodePublicKey(process.env.PI_MOTION_PUBLIC_KEY),
      'pi-feeder': this.decodePublicKey(process.env.PI_FEEDER_PUBLIC_KEY),
    };
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Development mode bypass...

    if (
      process.env.NODE_ENV === 'development' &&
      request.headers['x-dev-mode'] === 'true'
    ) {
      request['deviceId'] = 'dev-mode';
      request['requestTime'] = Date.now();
      logger.info(
        { deviceId: 'dev-mode' },
        'Development mode: Skipping ECDSA authentication',
      );
      return true;
    }

    // Extract required headers...

    const deviceId = request.headers['x-device-id'] as string;
    const signature = request.headers['x-signature'] as string;
    const timestamp = request.headers['x-timestamp'] as string;

    // Validate required headers...

    if (!deviceId || !signature || !timestamp) {
      throw new UnauthorizedException(
        'Missing required authentication headers',
      );
    }

    // Check if device is known...

    if (!this.devicePublicKeys[deviceId]) {
      throw new UnauthorizedException('Unknown device');
    }

    // Get the public key for signature verification...

    const publicKey = this.devicePublicKeys[deviceId];
    if (!publicKey) {
      throw new UnauthorizedException('Public key not found for device');
    }

    // Verify timestamp (prevent replay attacks)...

    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    const timeWindow = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(currentTime - requestTime) > timeWindow) {
      throw new UnauthorizedException('Request timestamp expired');
    }

    // Create the data to verify (method + path + body + timestamp)...

    const method = request.method;
    const path = request.url;
    const body = (request.body as Record<string, unknown>) || {};

    const dataToVerify = `${method}${path}${JSON.stringify(body)}${timestamp}`;

    // Verify the signature...

    const isValid = this.verifySignature(dataToVerify, signature, publicKey);

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Add device info to request for controllers to use...

    request['deviceId'] = deviceId;
    request['requestTime'] = requestTime;

    return true;
  }

  private decodePublicKey(base64Key: string | undefined): string | undefined {
    if (!base64Key) {
      return undefined;
    }

    try {
      const decoded = Buffer.from(base64Key, 'base64').toString('utf-8');
      const normalizedKey = decoded.replace(/\\n/g, '\n');
      return normalizedKey;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error decoding public key',
      );
      return undefined;
    }
  }

  private verifySignature(
    data: string,
    signature: string,
    publicKey: string,
  ): boolean {
    try {
      const verifier = crypto.createVerify('SHA256');
      verifier.update(data);
      return verifier.verify(publicKey, signature, 'base64');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error verifying signature',
      );
      return false;
    }
  }
}
