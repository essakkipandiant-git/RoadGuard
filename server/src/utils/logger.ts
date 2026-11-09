import { env } from "../config/env"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

class Logger {
  private minLevel: LogLevel

  constructor() {
    this.minLevel = env.LOG_LEVEL
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel]
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString()

    if (env.NODE_ENV === "production") {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...(meta && { meta }),
      })
    }

    const levelBadge = `[${level.toUpperCase()}]`.padEnd(7)
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : ""
    return `${timestamp} ${levelBadge} ${message}${metaStr}`
  }

  debug(message: string, meta?: any): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, meta))
    }
  }

  info(message: string, meta?: any): void {
    if (this.shouldLog("info")) {
      console.log(this.formatMessage("info", message, meta))
    }
  }

  warn(message: string, meta?: any): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, meta))
    }
  }

  error(message: string, meta?: any): void {
    if (this.shouldLog("error")) {
      console.error(this.formatMessage("error", message, meta))
    }
  }
}

export const logger = new Logger()

