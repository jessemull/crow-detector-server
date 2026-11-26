import { Logger } from '@nestjs/common';

export type NodeEnvironment = string;

export interface AppConfig {
  awsRegion: string;
  claudeApiKey?: string;
  claudeModel: string;
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
  corsAllowedOrigins: string[];
  devicePublicKeys: {
    piFeeder?: string;
    piPorch?: string;
    piUser?: string;
  };
}

const DEFAULT_CORS_ORIGINS = [
  'https://www.crittercanteen.com',
  'https://crittercanteen.com',
];

/** Next dev (:3000) and the signed-cookie test CDN proxy (:8080). */
const LOCAL_DEV_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];

const logger = new Logger('AppConfig');

/**
 * Load typed application config from environment variables.
 * Prefer injecting this via Nest ConfigModule rather than reading process.env in feature code.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    awsRegion: env.AWS_REGION || 'us-west-2',
    claudeApiKey: env.CLAUDE_API_KEY,
    claudeModel: env.CLAUDE_MODEL || 'claude-haiku-5-5',
    logLevel: env.LOG_LEVEL || 'info',
    nodeEnv: env.NODE_ENV || '',
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
    corsAllowedOrigins: parseCorsOrigins(env),
    devicePublicKeys: {
      piFeeder: env.PI_FEEDER_PUBLIC_KEY,
      piPorch: env.PI_PORCH_PUBLIC_KEY,
      piUser: env.PI_USER_PUBLIC_KEY,
    },
  };
}

function parseCorsOrigins(env: NodeJS.ProcessEnv): string[] {
  if (env.CORS_ALLOWED_ORIGINS) {
    return env.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  const origins = [...DEFAULT_CORS_ORIGINS];
  // ECS sets NODE_ENV to the stack Environment ("dev" / "prod"), not Nest's
  // "development". Include local proxy origins for any non-prod-like value.
  const nodeEnv = env.NODE_ENV || 'development';
  const isProdLike = nodeEnv === 'production' || nodeEnv === 'prod';
  if (!isProdLike) {
    origins.push(...LOCAL_DEV_CORS_ORIGINS);
  }
  return origins;
}

/**
 * Fail fast on missing required secrets unless the process is an explicit
 * local or ECS-dev environment. An unset NODE_ENV must not look like development.
 */
export function validateAppConfig(config: AppConfig): void {
  const skipFailFast =
    config.nodeEnv === 'development' ||
    config.nodeEnv === 'test' ||
    config.nodeEnv === 'dev';

  if (skipFailFast) {
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
    ['PI_FEEDER_PUBLIC_KEY', config.devicePublicKeys.piFeeder],
    ['PI_PORCH_PUBLIC_KEY', config.devicePublicKeys.piPorch],
  ];

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    const message = `Missing required environment variables for ${config.nodeEnv || 'unset NODE_ENV'}: ${missing.join(', ')}`;
    logger.error(message);
    throw new Error(message);
  }
}

export default () => loadAppConfig();
