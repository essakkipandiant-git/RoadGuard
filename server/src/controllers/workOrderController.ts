import { Request, Response, NextFunction } from "express"
import { WorkOrderService } from "../services/workOrderService"
import { AuditService } from "../services/auditService"
import {
  CreateWorkOrderInput,
  ListWorkOrdersQuery,
  UpdateWorkOrderStatusInput,
} from "../validators/workOrderValidators"

export class WorkOrderController {
  /**
   * POST /api/v1/work-orders
   * Dispatches a new work order for a road defect report.
   * Restricted to DEPARTMENT_ADMIN and SUPER_ADMIN.
   */
  static async createWorkOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const workOrder = await WorkOrderService.createWorkOrder(
        req.user!,
        req.body as CreateWorkOrderInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: "WORK_ORDER_DISPATCHED",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        details: {
          workOrderId: workOrder.id,
          issueId: workOrder.issueId,
          assignedToId: workOrder.assignedToId,
          departmentId: workOrder.departmentId,
          priority: workOrder.priority,
        },
        ipAddress: req.ip,
      })

      res.status(201).json({
        success: true,
        data: {
          workOrder,
        },
        message: "Work order dispatched successfully.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/work-orders
   * Retrieves paginated work orders with status and department filters.
   */
  static async getWorkOrders(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await WorkOrderService.getWorkOrders(
        req.user!,
        req.query as unknown as ListWorkOrdersQuery,
      )
      res.status(200).json({
        success: true,
        data: {
          workOrders: result.workOrders,
        },
        pagination: result.pagination,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/work-orders/:id
   * Retrieves a single work order by internal UUID.
   */
  static async getWorkOrderById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const workOrder = await WorkOrderService.getWorkOrderById(id, req.user!)
      res.status(200).json({
        success: true,
        data: {
          workOrder,
        },
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/v1/work-orders/:id/status
   * Updates work order status (e.g. IN_PROGRESS, COMPLETED).
   * Synchronizes defect status and logs audit history.
   */
  static async updateWorkOrderStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const workOrder = await WorkOrderService.updateWorkOrderStatus(
        id,
        req.user!,
        req.body as UpdateWorkOrderStatusInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: "WORK_ORDER_STATUS_CHANGED",
        entityType: "WorkOrder",
        entityId: id,
        details: {
          status: workOrder.status,
          targetStatus: (req.body as UpdateWorkOrderStatusInput).status,
          notes: (req.body as UpdateWorkOrderStatusInput).notes,
        },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: {
          workOrder,
        },
        message: `Work order status updated to '${workOrder.status}'.`,
      })
    } catch (error) {
      next(error)
    }
  }
}

