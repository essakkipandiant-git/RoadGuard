import { app } from "./app"
import { env } from "./config/env"
import { logger } from "./utils/logger"
import { MumbaiBoundaryService } from "./services/mumbaiBoundaryService"

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info(`🚀 RoadGuard API server running on port ${env.PORT} [${env.NODE_ENV}]`)
  logger.info(`   Health endpoint: http://localhost:${env.PORT}/api/health`)
  logger.info(`   Allowed origin:  ${env.FRONTEND_URL}`)

  // Initialize and synchronize official Greater Mumbai municipal boundaries
  MumbaiBoundaryService.syncBoundaryToDatabase()
    .then(() => logger.info("🏛️ MCGM Greater Mumbai municipal boundary synchronized with database"))
    .catch((err) => logger.warn("Boundary database sync warning:", { error: err.message }))
})

// Graceful Shutdown Handling
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Gracefully shutting down HTTP server...`)
  server.close(() => {
    logger.info("HTTP server closed. Exiting process.")
    process.exit(0)
  })

  // Force close after 10 seconds if lingering connections remain
  setTimeout(() => {
    logger.error("Forcefully shutting down server after timeout.")
    process.exit(1)
  }, 10000)
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

process.on("unhandledRejection", (reason: any) => {
  logger.error("Unhandled Promise Rejection detected:", { reason })
})

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception detected:", { error: error.message, stack: error.stack })
  process.exit(1)
})

