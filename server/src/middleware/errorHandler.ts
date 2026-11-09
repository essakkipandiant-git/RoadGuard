import { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { AppError } from "../utils/errors"
import { logger } from "../utils/logger"
import { env } from "../config/env"

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1. Handled AppError (custom operational errors)
  if (err instanceof AppError) {
    logger.warn(`Operational error: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      path: req.originalUrl,
      method: req.method,
      details: err.details,
    })

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    })
    return
  }

  // 2. Zod Schema Validation Error
  if (err instanceof ZodError) {
    const formattedDetails = err.issues.map((issue) => ({
      field: issue.path.join("."),
      issue: issue.message,
    }))

    logger.warn(`Request validation failed: ${req.method} ${req.originalUrl}`, {
      issues: formattedDetails,
    })

    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload or parameters",
        details: formattedDetails,
      },
    })
    return
  }

  // 3. Body-parser JSON syntax error
  if ("type" in err && (err as any).type === "entity.parse.failed") {
    logger.warn(`Malformed JSON body in request: ${req.method} ${req.originalUrl}`)
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON payload provided",
      },
    })
    return
  }

  // 4. Unexpected / Unhandled Error (Internal Server Error)
  logger.error(`Unhandled server exception: ${err.message}`, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  })

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected internal server error occurred"
          : err.message,
      ...(env.NODE_ENV !== "production" && { stack: err.stack }),
    },
  })
}

