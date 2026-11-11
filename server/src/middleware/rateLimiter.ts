import rateLimit, { ipKeyGenerator } from "express-rate-limit"
import { env } from "../config/env"
import { Request, Response } from "express"

function resolveClientIpKey(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"]
  if (typeof cfIp === "string" && cfIp.trim()) {
    return `cf:${cfIp.trim()}`
  }
  return ipKeyGenerator(req.ip || "127.0.0.1")
}

function resolveUserOrIpKey(req: Request): string {
  if (req.user?.id) {
    return `user:${req.user.id}`
  }
  return resolveClientIpKey(req)
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" || env.NODE_ENV === "development" ? 1000 : 100, // Balanced production limit allowing persona switches
  keyGenerator: resolveClientIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many login attempts from this IP. Please try again after 15 minutes.",
    },
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many login attempts. Account temporarily throttled for security.",
      },
    })
  },
})

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: env.NODE_ENV === "test" || env.NODE_ENV === "development" ? 5000 : 600,
  keyGenerator: resolveClientIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many API requests. Please slow down.",
    },
  },
})

export const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" || env.NODE_ENV === "development" ? 2000 : 120, // Per-user bucket behind Render/Cloudflare proxies
  keyGenerator: resolveUserOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Submission rate limit reached. Please wait a few minutes before reporting further hazards.",
    },
  },
})

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 1000 : 120, // Per-user image upload bucket behind Render/Cloudflare proxies
  keyGenerator: resolveUserOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Image upload rate limit reached. Please wait before uploading further photographs.",
    },
  },
})


