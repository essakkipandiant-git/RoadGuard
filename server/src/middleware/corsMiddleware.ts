import cors from "cors"
import { env } from "../config/env"

// Parse optional comma-separated origins from CORS_ORIGINS env var
const extraOrigins = (env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean)

// Build explicit allowlist from environment configuration
const allowedOrigins = Array.from(
  new Set([
    env.FRONTEND_URL.replace(/\/+$/, ""),
    ...extraOrigins,
    "http://localhost:8443",
    "http://127.0.0.1:8443",
    "https://road-guard-liard.vercel.app",
  ]),
).filter(Boolean)

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, and automated tests with undefined origin
    if (!origin) {
      return callback(null, true)
    }

    const normalizedOrigin = origin.replace(/\/+$/, "")

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true)
    }

    // Allow official RoadGuard Render static site and preview deployment URLs
    if (/^https:\/\/road[-_]?guard.*\.onrender\.com$/.test(normalizedOrigin)) {
      return callback(null, true)
    }

    // Allow official RoadGuard Vercel production and preview deployment URLs during cutover
    if (/^https:\/\/road[-_]?guard.*\.vercel\.app$/.test(normalizedOrigin)) {
      return callback(null, true)
    }

    // Allow localhost / 127.0.0.1 on any port during local development and testing
    if (env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS policy blocked access from origin: ${origin}`))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
  maxAge: 86400, // 24 hours
})

