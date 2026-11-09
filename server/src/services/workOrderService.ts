import { prisma } from "../config/prisma"
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  IssueStatus,
  ImageType,
  Role,
} from "@prisma/client"
import {
  CreateWorkOrderInput,
  ListWorkOrdersQuery,
  UpdateWorkOrderStatusInput,
} from "../validators/workOrderValidators"
import { AuthUser } from "../types"
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "../utils/errors"
import { isAdminRole, isStaffRole } from "../middleware/roleMiddleware"

export class WorkOrderService {
  /**
   * Dispatches a new work order for a road defect report.
   * Restricts creation to Department Admins and Super Admins.
   * Automatically advances RoadIssue status to ASSIGNED.
   */
  static async createWorkOrder(
    user: AuthUser,
    input: CreateWorkOrderInput,
  ): Promise<WorkOrder> {
    // 1. Role validation: Admin only
    if (!isAdminRole(user.role)) {
      throw new ForbiddenError("Only Department Admins or Super Admins can dispatch work orders.")
    }

    // 2. Fetch target road issue
    const issue = await prisma.roadIssue.findUnique({
      where: { id: input.issueId },
      include: { department: true },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${input.issueId}' was not found.`)
    }

    // 3. Resolve department jurisdiction
    const departmentId = input.departmentId || issue.departmentId
    if (!departmentId) {
      throw new BadRequestError("A municipal department must be assigned to this work order.")
    }

    // 4. Department boundary enforcement for Department Admins
    if (
      user.role === Role.DEPARTMENT_ADMIN &&
      user.departmentId &&
      user.departmentId !== departmentId
    ) {
      throw new ForbiddenError(
        "Access denied: You cannot dispatch work orders for another municipal department.",
      )
    }

    // 5. Verify assigned staff user if provided
    if (input.assignedToId) {
      const assignedUser = await prisma.user.findUnique({
        where: { id: input.assignedToId },
        select: { id: true, isActive: true, role: true },
      })

      if (!assignedUser || !assignedUser.isActive) {
        throw new BadRequestError("Assigned crew member was not found or is inactive.")
      }

      if (assignedUser.role === Role.CITIZEN) {
        throw new BadRequestError("Cannot assign work orders to a citizen account.")
      }
    }

    // 6. Determine initial status
    const initialStatus = input.scheduledDate
      ? WorkOrderStatus.SCHEDULED
      : WorkOrderStatus.PENDING

    // 7. Persist Work Order
    const workOrder = await prisma.workOrder.create({
      data: {
        issueId: issue.id,
        departmentId,
        assignedToId: input.assignedToId || null,
        workDescription: input.workDescription,
        priority: input.priority || WorkOrderPriority.MEDIUM,
        scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
        status: initialStatus,
      },
      include: {
        issue: true,
        department: true,
        assignedTo: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    })

    // 8. Automatically transition issue status to ASSIGNED and link department
    await prisma.roadIssue.update({
      where: { id: issue.id },
      data: {
        status: IssueStatus.ASSIGNED,
        departmentId,
      },
    })

    // 9. Record status history audit log
    await prisma.statusHistory.create({
      data: {
        issueId: issue.id,
        previousStatus: issue.status,
        newStatus: IssueStatus.ASSIGNED,
        changedById: user.id,
        remarks: `Work order dispatched: ${input.workDescription} [Priority: ${input.priority}]`,
      },
    })

    // 10. Notify reporting citizen
    if (issue.reportedById) {
      await prisma.notification.create({
        data: {
          userId: issue.reportedById,
          title: `Work Order Dispatched: ${issue.reportNumber}`,
          message: `A maintenance crew has been dispatched to repair this road hazard. Work order priority: ${input.priority}.`,
        },
      })
    }

    // 11. Notify assigned crew member
    if (input.assignedToId) {
      await prisma.notification.create({
        data: {
          userId: input.assignedToId,
          title: `New Work Order Assigned: ${issue.reportNumber}`,
          message: `You have been assigned to repair: ${issue.title} at ${issue.address}.`,
        },
      })
    }

    return workOrder
  }

  /**
   * Retrieves paginated work orders with department boundary filtering.
   */
  static async getWorkOrders(
    user: AuthUser,
    query: ListWorkOrdersQuery,
  ): Promise<{
    workOrders: WorkOrder[]
    pagination: {
      page: number
      limit: number
      totalRecords: number
      totalPages: number
    }
  }> {
    const where: any = {}

    // Department boundary: Department Admins only see their department
    if (user.role === Role.DEPARTMENT_ADMIN && user.departmentId) {
      where.departmentId = user.departmentId
    } else if (query.departmentId) {
      where.departmentId = query.departmentId
    }

    if (query.status) {
      where.status = query.status
    }

    if (query.priority) {
      where.priority = query.priority
    }

    if (query.assignedToId) {
      where.assignedToId = query.assignedToId
    }

    if (query.issueId) {
      where.issueId = query.issueId
    }

    const skip = (query.page - 1) * query.limit
    const take = query.limit

    const [workOrders, totalRecords] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        skip,
        take,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: {
          issue: {
            include: {
              ward: true,
              images: true,
            },
          },
          department: true,
          assignedTo: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.workOrder.count({ where }),
    ])

    return {
      workOrders,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / query.limit),
      },
    }
  }

  /**
   * Retrieves a single work order by ID with department boundary enforcement.
   */
  static async getWorkOrderById(id: string, user: AuthUser): Promise<WorkOrder> {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: {
        issue: {
          include: {
            ward: true,
            images: true,
            statusHistory: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        department: true,
        assignedTo: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    })

    if (!workOrder) {
      throw new NotFoundError(`Work order '${id}' was not found.`)
    }

    // Boundary check for Department Admins
    if (
      user.role === Role.DEPARTMENT_ADMIN &&
      user.departmentId &&
      workOrder.departmentId !== user.departmentId
    ) {
      throw new ForbiddenError(
        "Access denied: You are not authorized to access work orders for another department.",
      )
    }

    return workOrder
  }

  /**
   * Updates work order status, advancing or completing defect repairs.
   * Synchronizes RoadIssue lifecycle status and notifies citizens.
   */
  static async updateWorkOrderStatus(
    id: string,
    user: AuthUser,
    input: UpdateWorkOrderStatusInput,
  ): Promise<WorkOrder> {
    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: {
        issue: true,
        department: true,
      },
    })

    if (!workOrder) {
      throw new NotFoundError(`Work order '${id}' was not found.`)
    }

    // Permission check: Super Admin, Department Admin of same department, or assigned crew member
    const isSuperAdmin = user.role === Role.SUPER_ADMIN
    const isMatchingDeptAdmin =
      user.role === Role.DEPARTMENT_ADMIN &&
      (!user.departmentId || user.departmentId === workOrder.departmentId)
    const isAssignedCrew = workOrder.assignedToId === user.id

    if (!isSuperAdmin && !isMatchingDeptAdmin && !isAssignedCrew) {
      throw new ForbiddenError(
        "You are not authorized to update the status of this work order.",
      )
    }

    const previousStatus = workOrder.status
    const targetStatus = input.status

    let completedDate: Date | null | undefined = undefined

    // 1. If transitioning to IN_PROGRESS, advance RoadIssue to IN_PROGRESS
    if (targetStatus === WorkOrderStatus.IN_PROGRESS) {
      await prisma.roadIssue.update({
        where: { id: workOrder.issueId },
        data: { status: IssueStatus.IN_PROGRESS },
      })

      await prisma.statusHistory.create({
        data: {
          issueId: workOrder.issueId,
          previousStatus: workOrder.issue.status,
          newStatus: IssueStatus.IN_PROGRESS,
          changedById: user.id,
          remarks: input.notes || "Maintenance crew commenced on-site asphalt repairs.",
        },
      })

      if (workOrder.issue.reportedById) {
        await prisma.notification.create({
          data: {
            userId: workOrder.issue.reportedById,
            title: `Repair In Progress: ${workOrder.issue.reportNumber}`,
            message: "Our maintenance team has commenced on-site repair work.",
          },
        })
      }
    }

    // 2. If transitioning to COMPLETED, advance RoadIssue to REPAIR_COMPLETED
    if (targetStatus === WorkOrderStatus.COMPLETED) {
      completedDate = input.completedDate ? new Date(input.completedDate) : new Date()

      await prisma.roadIssue.update({
        where: { id: workOrder.issueId },
        data: { status: IssueStatus.REPAIR_COMPLETED },
      })

      // If repair evidence photo provided, record in IssueImage table
      if (input.repairEvidenceUrl) {
        await prisma.issueImage.create({
          data: {
            issueId: workOrder.issueId,
            imageUrl: input.repairEvidenceUrl,
            imageType: ImageType.REPAIR_AFTER,
          },
        })
      }

      await prisma.statusHistory.create({
        data: {
          issueId: workOrder.issueId,
          previousStatus: workOrder.issue.status,
          newStatus: IssueStatus.REPAIR_COMPLETED,
          changedById: user.id,
          remarks: input.notes || "Work order completed. Road defect successfully repaired.",
        },
      })

      if (workOrder.issue.reportedById) {
        await prisma.notification.create({
          data: {
            userId: workOrder.issue.reportedById,
            title: `Repairs Completed: ${workOrder.issue.reportNumber}`,
            message: "Repairs have been completed for your reported road hazard. Thank you for keeping our roads safe!",
          },
        })
      }
    }

    // 3. Update the Work Order itself
    const updated = await prisma.workOrder.update({
      where: { id },
      data: {
        status: targetStatus,
        completedDate,
      },
      include: {
        issue: {
          include: {
            ward: true,
            images: true,
          },
        },
        department: true,
        assignedTo: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    })

    return updated
  }
}

