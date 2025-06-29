declare const LOG_LEVELS: {
    readonly error: 0;
    readonly warn: 1;
    readonly info: 2;
    readonly debug: 3;
};
type LogLevel = keyof typeof LOG_LEVELS;
declare class Logger {
    private logLevel;
    constructor(logLevel?: LogLevel);
    private shouldLog;
    private formatMessage;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
}
export declare const logger: Logger;
export default logger;
//# sourceMappingURL=logger.d.ts.map