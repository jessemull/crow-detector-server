type LogFields = Record<string, unknown>;

function write(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  fields: LogFields = {},
): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  // Structured single-line JSON for CloudWatch — never dump full SQS/S3 payloads.
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  });

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const lambdaLogger = {
  debug: (message: string, fields?: LogFields) =>
    write('debug', message, fields),
  error: (message: string, fields?: LogFields) =>
    write('error', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
};
