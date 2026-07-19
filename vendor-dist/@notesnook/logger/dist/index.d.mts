//#region src/types.d.ts
interface ILogReporter {
  write(message: LogMessage): void;
}
declare enum LogLevel {
  Fatal = 0,
  Error = 1,
  Warn = 2,
  Info = 3,
  Debug = 4,
  Log = 5,
}
type LogMessage = {
  timestamp: number;
  message: string;
  level: LogLevel;
  scope?: string;
  extras?: Record<string, unknown>;
  elapsed?: number;
};
type LoggerConfig = {
  reporter: ILogReporter;
  lastTime: number;
  scope?: string;
};
//#endregion
//#region src/reporters/console.d.ts
declare const consoleReporter: ILogReporter;
declare function format(log: LogMessage): string;
//#endregion
//#region src/index.d.ts
type LogLevelFunc = (message: string, extras?: Record<string, unknown>) => void;
type ErrorLogLevelFunc = (error: Error | unknown, fallbackMessage?: string, extras?: Record<string, unknown>) => void;
interface ILogger {
  fatal: ErrorLogLevelFunc;
  warn: LogLevelFunc;
  debug: LogLevelFunc;
  error: ErrorLogLevelFunc;
  info: LogLevelFunc;
  log: LogLevelFunc;
  measure: (tag: string) => void;
  scope: (scope: string) => ILogger;
}
declare class Logger implements ILogger {
  private readonly config;
  constructor(config?: LoggerConfig);
  scope(scope: string): Logger;
  fatal: (error: unknown, fallbackMessage?: string | undefined, extras?: Record<string, unknown> | undefined) => void;
  warn: (message: string, extras?: Record<string, unknown> | undefined) => void;
  debug: (message: string, extras?: Record<string, unknown> | undefined) => void;
  error: (error: unknown, fallbackMessage?: string | undefined, extras?: Record<string, unknown> | undefined) => void;
  info: (message: string, extras?: Record<string, unknown> | undefined) => void;
  log: (message: string, extras?: Record<string, unknown> | undefined) => void;
  measure(tag: string): void;
}
declare class NoopLogger implements ILogger {
  fatal(): void;
  warn(): void;
  debug(): void;
  error(): void;
  info(): void;
  log(): void;
  measure(): void;
  scope(): this;
  replaceWith(logger: ILogger): void;
}
declare function combineReporters(reporters: ILogReporter[]): ILogReporter;
//#endregion
export { ILogReporter, ILogger, LogLevel, LogMessage, Logger, LoggerConfig, NoopLogger, combineReporters, consoleReporter, format };