import { z } from "zod"

export const dashboardFilterSchema = z.object({
  departmentId: z.string().uuid("Invalid departmentId format").optional(),
  wardId: z.string().uuid("Invalid wardId format").optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
})

export type DashboardFilterInput = z.infer<typeof dashboardFilterSchema>

