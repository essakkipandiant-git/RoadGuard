import { Request, Response, NextFunction } from "express"
import { AnalyticsService } from "../services/analyticsService"

export class AnalyticsController {
  /**
   * GET /api/v1/analytics/dashboard
   * Returns aggregated city road defect metrics, status breakdowns, and ward distributions.
   */
  static async getDashboard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const filters = {
        departmentId: typeof req.query.departmentId === "string" ? req.query.departmentId : undefined,
        wardId: typeof req.query.wardId === "string" ? req.query.wardId : undefined,
        startDate: typeof req.query.startDate === "string" ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === "string" ? req.query.endDate : undefined,
      }

      const metrics = await AnalyticsService.getDashboardMetrics(filters)

      res.status(200).json({
        success: true,
        data: metrics,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/analytics/metadata
   * Returns active municipal departments and wards for frontend filter dropdowns.
   */
  static async getMetadata(
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const metadata = await AnalyticsService.getMunicipalMetadata()
      res.status(200).json({
        success: true,
        data: metadata,
      })
    } catch (error) {
      next(error)
    }
  }
}

