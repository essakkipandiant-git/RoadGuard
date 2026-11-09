import { Request, Response } from "express"
import { env } from "../config/env"

export function getHealthStatus(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "roadguard-api",
      version: "1.0.0",
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    message: "RoadGuard API server is healthy and operational",
  })
}

