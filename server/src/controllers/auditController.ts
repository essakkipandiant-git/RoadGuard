import { Request, Response, NextFunction } from "express"
import { AuditService } from "../services/auditService"

export class AuditController {
  /**
   * GET /api/v1/audit-logs
   * Retrieves paginated municipal audit logs with filtering.
   * Restricted to SUPER_ADMIN.
   */
  static async getLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20
      const action = typeof req.query.action === "string" ? req.query.action : undefined
      const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined
      const userId = typeof req.query.userId === "string" ? req.query.userId : undefined

      const result = await AuditService.getLogs({
        page,
        limit,
        action,
        entityType,
        userId,
      })

      res.status(200).json({
        success: true,
        data: {
          logs: result.logs,
        },
        pagination: result.pagination,
      })
    } catch (error) {
      next(error)
    }
  }
}

