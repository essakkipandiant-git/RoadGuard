import { Router, Request, Response, NextFunction } from "express"
import { Role, IssueStatus } from "@prisma/client"
import {
  requireRole,
  requireMinRole,
  requireStaff,
  requireAdmin,
  requireSuperAdmin,
  requireCitizen,
  requireDepartmentAccess,
  requireWardAccess,
  requireOwnershipOrStaff,
  isStatusTransitionAllowed,
} from "../middleware/roleMiddleware"
import { BadRequestError, ForbiddenError } from "../utils/errors"

export const rbacDemoRouter = Router()

/**
 * Citizen-only test endpoint
 */
rbacDemoRouter.get(
  "/citizen-only",
  requireCitizen,
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Citizen access granted",
      user: req.user,
    })
  },
)

/**
 * Inspector-only test endpoint (Inspector or Super Admin)
 */
rbacDemoRouter.get(
  "/inspector-only",
  requireRole(Role.INSPECTOR, Role.SUPER_ADMIN),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Inspector access granted",
      user: req.user,
    })
  },
)

/**
 * Admin-only test endpoint (Department Admin or Super Admin)
 */
rbacDemoRouter.get(
  "/admin-only",
  requireAdmin,
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Admin access granted",
      user: req.user,
    })
  },
)

/**
 * Super Admin-only test endpoint
 */
rbacDemoRouter.get(
  "/super-admin-only",
  requireSuperAdmin,
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Super Admin access granted",
      user: req.user,
    })
  },
)

/**
 * Minimum hierarchical role test endpoint (Requires rank >= INSPECTOR)
 */
rbacDemoRouter.get(
  "/min-inspector",
  requireMinRole(Role.INSPECTOR),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Minimum inspector access granted",
      user: req.user,
    })
  },
)

/**
 * Department-scoped test endpoint
 */
rbacDemoRouter.get(
  "/department/:departmentId",
  requireDepartmentAccess((req) => req.params.departmentId),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Department access granted",
      departmentId: req.params.departmentId,
      user: req.user,
    })
  },
)

/**
 * Ward-scoped test endpoint
 */
rbacDemoRouter.get(
  "/ward/:wardId",
  requireWardAccess((req) => req.params.wardId),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Ward access granted",
      wardId: req.params.wardId,
      user: req.user,
    })
  },
)

/**
 * Report ownership or staff test endpoint
 */
rbacDemoRouter.get(
  "/report-owner/:ownerId",
  requireOwnershipOrStaff((req) => req.params.ownerId),
  (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Report access granted",
      ownerId: req.params.ownerId,
      user: req.user,
    })
  },
)

/**
 * State machine status transition test endpoint
 */
rbacDemoRouter.post(
  "/status-transition",
  requireStaff,
  (req: Request, res: Response, next: NextFunction) => {
    const { currentStatus, targetStatus } = req.body

    if (!currentStatus || !targetStatus) {
      return next(new BadRequestError("currentStatus and targetStatus are required"))
    }

    const allowed = isStatusTransitionAllowed(
      req.user!.role,
      currentStatus as IssueStatus,
      targetStatus as IssueStatus,
    )

    if (!allowed) {
      return next(
        new ForbiddenError(
          `Role '${req.user!.role}' is not authorized to transition status from '${currentStatus}' to '${targetStatus}'.`,
        ),
      )
    }

    res.json({
      success: true,
      message: `Status transition from '${currentStatus}' to '${targetStatus}' authorized for '${req.user!.role}'.`,
    })
  },
)

