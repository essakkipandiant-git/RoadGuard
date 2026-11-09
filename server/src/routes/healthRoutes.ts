import { Router } from "express"
import { getHealthStatus } from "../controllers/healthController"

export const healthRouter = Router()

/**
 * @route   GET /api/health
 * @desc    System health check & operational status
 * @access  Public
 */
healthRouter.get("/health", getHealthStatus)

