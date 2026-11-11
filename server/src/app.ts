import express, { Express, Request, Response, NextFunction } from "express"
import path from "path"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import { corsMiddleware } from "./middleware/corsMiddleware"
import { apiLimiter } from "./middleware/rateLimiter"
import { errorHandler } from "./middleware/errorHandler"
import { notFoundHandler } from "./middleware/notFoundHandler"
import { rootRouter } from "./routes"
import { logger } from "./utils/logger"
import { env } from "./config/env"

export function createApp(): Express {
  const app: Express = express()

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )

  // 2. Strict CORS allowlisting
  app.use(corsMiddleware)

  // 3. Body & Cookie Parsing with safety limits
  app.use(cookieParser())
  app.use(express.json({ limit: "10mb" }))
  app.use(express.urlencoded({ extended: true, limit: "10mb" }))

  // 4. Request Logging Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on("finish", () => {
      const duration = Date.now() - start
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      })
    })
    next()
  })

  // 5. Mount API Routes with global rate limiting
  app.use("/api", apiLimiter, rootRouter)

  // Serve uploaded images statically in development/fallback mode
  app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)))

  // Top-level root endpoint for health checks and service discovery
  app.get("/", (_req, res) => {
    res.status(200).json({
      service: "RoadGuard AI — Municipal Road Infrastructure & Defect Triage REST API",
      status: "operational",
      version: "1.0.0",
      environment: env.NODE_ENV,
      healthEndpoint: "/api/health",
      apiBase: "/api/v1",
      timestamp: new Date().toISOString(),
    })
  })

  // Top-level /health alias for container health checks
  app.get("/health", (_req, res) => {
    res.redirect("/api/health")
  })

  // 6. 404 Not Found Handler (must be after all routes)
  app.use(notFoundHandler)

  // 7. Centralized Error Handler (must be last middleware)
  app.use(errorHandler)

  return app
}

export const app = createApp()

