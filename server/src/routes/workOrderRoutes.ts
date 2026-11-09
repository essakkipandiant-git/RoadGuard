import { Router } from "express"
import { WorkOrderController } from "../controllers/workOrderController"
import { requireAuth } from "../middleware/authMiddleware"
import { requireAdmin, requireStaff } from "../middleware/roleMiddleware"
import { validateBody, validateQuery } from "../middleware/validateRequest"
import {
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  updateWorkOrderStatusSchema,
} from "../validators/workOrderValidators"

export const workOrderRouter = Router()

// All work order routes require an active session
workOrderRouter.use(requireAuth)

/**
 * @route   POST /api/v1/work-orders
 * @desc    Dispatch a new work order for a road defect report
 * @access  Department Admin, Super Admin
 */
workOrderRouter.post(
  "/",
  requireAdmin,
  validateBody(createWorkOrderSchema),
  WorkOrderController.createWorkOrder,
)

/**
 * @route   GET /api/v1/work-orders
 * @desc    List work orders with department/status filtering & pagination
 * @access  Staff (Inspector, Dept Admin, Super Admin)
 */
workOrderRouter.get(
  "/",
  requireStaff,
  validateQuery(listWorkOrdersQuerySchema),
  WorkOrderController.getWorkOrders,
)

/**
 * @route   GET /api/v1/work-orders/:id
 * @desc    Get detailed work order by internal UUID
 * @access  Staff (Inspector, Dept Admin, Super Admin)
 */
workOrderRouter.get(
  "/:id",
  requireStaff,
  WorkOrderController.getWorkOrderById,
)

/**
 * @route   PATCH /api/v1/work-orders/:id/status
 * @desc    Update work order status (e.g. IN_PROGRESS, COMPLETED, CANCELLED)
 * @access  Staff (Assigned Crew, Dept Admin, Super Admin)
 */
workOrderRouter.patch(
  "/:id/status",
  requireStaff,
  validateBody(updateWorkOrderStatusSchema),
  WorkOrderController.updateWorkOrderStatus,
)

