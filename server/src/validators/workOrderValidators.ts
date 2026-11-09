import { z } from "zod"
import { WorkOrderStatus, WorkOrderPriority } from "@prisma/client"

export const createWorkOrderSchema = z.object({
  issueId: z.string({ required_error: "issueId is required" }).uuid("Invalid issue ID format"),
  departmentId: z.string().uuid("Invalid department ID format").optional().nullable(),
  assignedToId: z.string().uuid("Invalid assignedToId user format").optional().nullable(),
  workDescription: z
    .string({ required_error: "workDescription is required" })
    .trim()
    .min(5, "Work description must be at least 5 characters long")
    .max(1000, "Work description cannot exceed 1000 characters"),
  priority: z.nativeEnum(WorkOrderPriority, {
    errorMap: () => ({
      message: "Priority must be one of: EMERGENCY, HIGH, MEDIUM, LOW",
    }),
  }).default(WorkOrderPriority.MEDIUM),
  scheduledDate: z
    .string()
    .datetime({ message: "scheduledDate must be a valid ISO 8601 date string" })
    .optional()
    .nullable(),
})

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>

export const updateWorkOrderStatusSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus, {
    errorMap: () => ({
      message: "Status must be one of: PENDING, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED",
    }),
  }),
  notes: z.string().trim().max(1000, "Notes cannot exceed 1000 characters").optional(),
  completedDate: z
    .string()
    .datetime({ message: "completedDate must be a valid ISO 8601 date string" })
    .optional(),
  repairEvidenceUrl: z.string().url("repairEvidenceUrl must be a valid URL").optional(),
})

export type UpdateWorkOrderStatusInput = z.infer<typeof updateWorkOrderStatusSchema>

export const listWorkOrdersQuerySchema = z.object({
  status: z.nativeEnum(WorkOrderStatus).optional(),
  priority: z.nativeEnum(WorkOrderPriority).optional(),
  departmentId: z.string().optional(),
  assignedToId: z.string().optional(),
  issueId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "scheduledDate", "priority", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>

