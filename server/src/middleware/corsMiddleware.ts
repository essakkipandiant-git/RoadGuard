import cors from "cors"
import { env } from "../config/env"

// Build explicit allowlist from environment configuration
const allowedOrigins = Array.from(
  new Set([
    env.FRONTEND_URL,
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

    if (allowedOrigins.includes(origin)) {
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

