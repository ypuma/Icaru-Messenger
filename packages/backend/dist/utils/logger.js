"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};
class Logger {
    logLevel;
    constructor(logLevel = 'info') {
        this.logLevel = logLevel;
    }
    shouldLog(level) {
        return LOG_LEVELS[level] <= LOG_LEVELS[this.logLevel];
    }
    formatMessage(level, message, ...args) {
        if (!this.shouldLog(level))
            return;
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        console.log(prefix, message, ...args);
    }
    error(message, ...args) {
        this.formatMessage('error', message, ...args);
    }
    warn(message, ...args) {
        this.formatMessage('warn', message, ...args);
    }
    info(message, ...args) {
        this.formatMessage('info', message, ...args);
    }
    debug(message, ...args) {
        this.formatMessage('debug', message, ...args);
    }
}
// Create default logger instance
const logLevel = process.env.LOG_LEVEL || 'info';
exports.logger = new Logger(logLevel);
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map