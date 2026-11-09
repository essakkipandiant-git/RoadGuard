import { Router } from "express"
import { AnalyticsController } from "../controllers/analyticsController"
import { authenticate } from "../middleware/authMiddleware"
import { validateQuery } from "../middleware/validateRequest"
import { dashboardFilterSchema } from "../validators/analyticsValidators"

export const analyticsRouter = Router()

/**
 * @route   GET /api/v1/analytics/dashboard
 * @desc    Get aggregated municipal operations dashboard metrics
 * @access  Public / Authenticated
 */
analyticsRouter.get(
  "/dashboard",
  authenticate,
  validateQuery(dashboardFilterSchema),
  AnalyticsController.getDashboard,
)

/**
 * @route   GET /api/v1/analytics/metadata
 * @desc    Get active departments and wards metadata for UI filter dropdowns
 * @access  Public / Authenticated
 */
analyticsRouter.get(
  "/metadata",
  authenticate,
  AnalyticsController.getMetadata,
)

