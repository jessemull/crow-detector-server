import { createLogger as createBunyanLogger } from 'bunyan';
import * as bunyan from 'bunyan';
import { loadAppConfig } from '../../config/app.config';

export function createLogger(name: string): bunyan {
  const { logLevel } = loadAppConfig();
  return createBunyanLogger({
    level: (logLevel as bunyan.LogLevel) || 'info',
    name,
  });
}

export const logger = createLogger('crow-detector');
