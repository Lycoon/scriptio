// 1. Define your levels
enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

class Logger {
    private static instance: Logger;
    private readonly currentLevel: LogLevel;

    private constructor() {
        const env = process.env.NODE_ENV || "production";

        if (env === "development") {
            this.currentLevel = LogLevel.DEBUG;
        } else {
            this.currentLevel = LogLevel.WARN;
        }
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private log(level: LogLevel, message: string, ...args: unknown[]) {
        if (level >= this.currentLevel) {
            const timestamp = new Date().toISOString();
            const label = LogLevel[level];
            const method = level === LogLevel.ERROR ? "error" : level === LogLevel.WARN ? "warn" : "log";

            console[method](`[${timestamp}] [${label}]: ${message}`, ...args);
        }
    }

    debug(msg: string, ...args: unknown[]) {
        this.log(LogLevel.DEBUG, msg, ...args);
    }
    info(msg: string, ...args: unknown[]) {
        this.log(LogLevel.INFO, msg, ...args);
    }
    warn(msg: string, ...args: unknown[]) {
        this.log(LogLevel.WARN, msg, ...args);
    }
    error(msg: string, ...args: unknown[]) {
        this.log(LogLevel.ERROR, msg, ...args);
    }
}

export const logger = Logger.getInstance();
