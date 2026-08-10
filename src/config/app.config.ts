import { Logger } from '@nestjs/common';

export type NodeEnvironment = string;

export interface AppConfig {
  awsRegion: string;
  claudeApiKey?: string;
  claudeModel: string;
  feedCooldownHours: number;
  logLevel: string;
  nodeEnv: NodeEnvironment;
  port: number;
  rds: {
    database?: string;
    host?: string;
    password?: string;
    port: number;
    sslRejectUnauthorized: boolean;
    username?: string;
  };
  s3BucketName?: string;
  devicePublicKeys: {
    lambdaS3?: string;
    piFeeder?: string;
    piMotion?: string;
    piUser?: string;
  };
}

const logger = new Logger('AppConfig');

/**
 * Load typed application config from environment variables.
 * Prefer injecting this via Nest ConfigModule rather than reading process.env in feature code.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    awsRegion: env.AWS_REGION || 'us-west-2',
    claudeApiKey: env.CLAUDE_API_KEY,
    claudeModel: env.CLAUDE_MODEL || 'claude-3-opus-20240229',
    feedCooldownHours: parseInt(env.FEED_COOLDOWN_HOURS || '4', 10),
    logLevel: env.LOG_LEVEL || 'info',
    nodeEnv: env.NODE_ENV || 'development',
    port: parseInt(env.PORT || '3000', 10) || 3000,
    rds: {
      database: env.RDS_DATABASE,
      host: env.RDS_HOST,
      password: env.RDS_PASSWORD,
      port: parseInt(env.RDS_PORT || '5432', 10),
      // Prefer verifying the RDS CA. Opt-out via SSL_REJECT_UNAUTHORIZED=false is
      // allowed only outside production/prod (local tunnel / temporary diagnostics).
      sslRejectUnauthorized: (() => {
        const isProdLike =
          env.NODE_ENV === 'production' || env.NODE_ENV === 'prod';
        if (isProdLike) {
          return true;
        }
        return env.SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;
      })(),
      username: env.RDS_USERNAME,
    },
    s3BucketName: env.S3_BUCKET_NAME,
    devicePublicKeys: {
      lambdaS3: env.LAMBDA_S3_PUBLIC_KEY,
      piFeeder: env.PI_FEEDER_PUBLIC_KEY,
      piMotion: env.PI_MOTION_PUBLIC_KEY,
      piUser: env.PI_USER_PUBLIC_KEY,
    },
  };
}

/**
 * Fail fast on missing required secrets outside development/test.
 */
export function validateAppConfig(config: AppConfig): void {
  const isProdLike =
    config.nodeEnv === 'production' || config.nodeEnv === 'prod';

  if (!isProdLike) {
    return;
  }

  const required: Array<[string, string | undefined]> = [
    ['RDS_HOST', config.rds.host],
    ['RDS_DATABASE', config.rds.database],
    ['RDS_USERNAME', config.rds.username],
    ['RDS_PASSWORD', config.rds.password],
    ['S3_BUCKET_NAME', config.s3BucketName],
    ['CLAUDE_API_KEY', config.claudeApiKey],
    ['PI_USER_PUBLIC_KEY', config.devicePublicKeys.piUser],
    ['PI_MOTION_PUBLIC_KEY', config.devicePublicKeys.piMotion],
    ['PI_FEEDER_PUBLIC_KEY', config.devicePublicKeys.piFeeder],
    ['LAMBDA_S3_PUBLIC_KEY', config.devicePublicKeys.lambdaS3],
  ];

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    const message = `Missing required environment variables for production: ${missing.join(', ')}`;
    logger.error(message);
    throw new Error(message);
  }
}

export default () => loadAppConfig();
