import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class EcdsaAuthMiddleware implements NestMiddleware {
  // Load public keys from environment variables...

  private readonly devicePublicKeys = {
    'pi-user': process.env.PI_USER_PUBLIC_KEY,
    'pi-motion': process.env.PI_MOTION_PUBLIC_KEY,
    'pi-feeder': process.env.PI_FEEDER_PUBLIC_KEY,
  };

  use(req: Request, res: Response, next: NextFunction) {
    // Development mode bypass...

    if (
      process.env.NODE_ENV === 'development' &&
      req.headers['x-dev-mode'] === 'true'
    ) {
      req['deviceId'] = 'dev-mode';
      req['requestTime'] = Date.now();
      console.log('Development mode: Skipping ECDSA authentication');
      return next();
    }

    // Extract required headers...

    const deviceId = req.headers['x-device-id'] as string;
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;

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

    const publicKey = this.devicePublicKeys[deviceId] as string;

    // Verify timestamp (prevent replay attacks)...

    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    const timeWindow = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(currentTime - requestTime) > timeWindow) {
      throw new UnauthorizedException('Request timestamp expired');
    }

    // Create the data to verify (method + path + body + timestamp)...

    const dataToVerify = `${req.method}${req.path}${JSON.stringify(req.body)}${timestamp}`;

    // Verify the signature...

    const isValid = this.verifySignature(dataToVerify, signature, publicKey);

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Add device info to request for controllers to use...

    req['deviceId'] = deviceId;
    req['requestTime'] = requestTime;

    next();
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
      console.error('Error verifying signature:', error);
      return false;
    }
  }
}
