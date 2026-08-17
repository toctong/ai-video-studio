import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { appLogBuffer, type AppLogLevel } from './app-log.buffer';

/**
 * 在输出到控制台的同时写入环形缓冲，供「系统日志」面板展示。
 */
export class BufferingLogger extends ConsoleLogger {
  constructor(context = 'Nest') {
    super(context);
  }

  log(message: any, ...optionalParams: any[]) {
    this.capture('log', message, optionalParams);
    super.log(message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.capture('error', message, optionalParams);
    super.error(message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.capture('warn', message, optionalParams);
    super.warn(message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.capture('debug', message, optionalParams);
    super.debug(message, ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.capture('verbose', message, optionalParams);
    super.verbose(message, ...optionalParams);
  }

  private capture(level: AppLogLevel, message: any, optionalParams: any[]) {
    const context = this.pickContext(optionalParams) || this.context || 'Nest';
    // Nest 常见：error(message, stack, context)
    if (level === 'error' && optionalParams.length >= 1) {
      const maybeStack = optionalParams[0];
      if (typeof maybeStack === 'string' && maybeStack.includes('\n') && !this.isContext(maybeStack)) {
        const body = `${this.asText(message)}\n${maybeStack}`;
        appLogBuffer.push(level, body, context);
        return;
      }
    }
    appLogBuffer.push(level, this.asText(message), context);
  }

  private pickContext(optionalParams: any[]): string {
    if (!optionalParams.length) return '';
    const last = optionalParams[optionalParams.length - 1];
    return this.isContext(last) ? String(last) : '';
  }

  private isContext(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0 && value.length < 80 && !value.includes('\n');
  }

  private asText(message: unknown): string {
    if (message == null) return '';
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message || String(message);
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}

export const APP_LOG_LEVELS: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];
