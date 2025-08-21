import * as bunyan from 'bunyan';

export const createLogger = (name: string): bunyan => {
  const logLevel = (process.env.LOG_LEVEL as bunyan.LogLevel) || 'info';

  return bunyan.createLogger({
    name,
    level: logLevel,
    serializers: bunyan.stdSerializers,
    streams: [
      {
        level: 'info',
        stream: process.stdout,
      },
      {
        level: 'error',
        stream: process.stderr,
      },
    ],
  });
};

export const logger = createLogger('crow-detector-server');
