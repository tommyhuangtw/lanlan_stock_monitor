type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
