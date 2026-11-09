import { Router } from "express"
import { Role } from "@prisma/client"
import { AuditController } from "../controllers/auditController"
import { requireAuth } from "../middleware/authMiddleware"
import { requireMinRole } from "../middleware/roleMiddleware"

export const auditRouter = Router()

// All audit log endpoints require authentication and SUPER_ADMIN privilege
auditRouter.use(requireAuth)
auditRouter.use(requireMinRole(Role.SUPER_ADMIN))

/**
 * @route   GET /api/v1/audit-logs
 * @desc    Get paginated municipal audit logs with entity and action filters
 * @access  Super Admin (Tier 4)
 */
auditRouter.get("/", AuditController.getLogs)

