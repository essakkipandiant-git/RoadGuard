import { Router } from "express"
import { healthRouter } from "./healthRoutes"
import { authRouter } from "./authRoutes"
import { rbacDemoRouter } from "./rbacDemoRoutes"
import { issueRouter } from "./issueRoutes"
import { uploadRouter } from "./uploadRoutes"
import { workOrderRouter } from "./workOrderRoutes"
import { analyticsRouter } from "./analyticsRoutes"
import { auditRouter } from "./auditRoutes"
import geoRouter from "./geoRoutes"
import { aiRouter } from "./aiRoutes"

export const rootRouter = Router()

// Health check mounted at /api/health
rootRouter.use(healthRouter)

// Authentication endpoints mounted at /api/v1/auth and /api/auth
rootRouter.use("/v1/auth", authRouter)
rootRouter.use("/auth", authRouter)

// RBAC validation endpoints mounted at /api/v1/rbac and /api/rbac
rootRouter.use("/v1/rbac", rbacDemoRouter)
rootRouter.use("/rbac", rbacDemoRouter)

// Road issue endpoints mounted at /api/v1/issues and /api/issues
rootRouter.use("/v1/issues", issueRouter)
rootRouter.use("/issues", issueRouter)

// Upload endpoints mounted at /api/v1/uploads and /api/uploads
rootRouter.use("/v1/uploads", uploadRouter)
rootRouter.use("/uploads", uploadRouter)

// Work order endpoints mounted at /api/v1/work-orders and /api/work-orders
rootRouter.use("/v1/work-orders", workOrderRouter)
rootRouter.use("/work-orders", workOrderRouter)

// Dashboard analytics endpoints mounted at /api/v1/analytics and /api/analytics
rootRouter.use("/v1/analytics", analyticsRouter)
rootRouter.use("/analytics", analyticsRouter)

// Security audit logging endpoints mounted at /api/v1/audit-logs and /api/audit-logs
rootRouter.use("/v1/audit-logs", auditRouter)
rootRouter.use("/audit-logs", auditRouter)

// Geographic boundary validation endpoints mounted at /api/v1/geo and /api/geo
rootRouter.use("/v1/geo", geoRouter)
rootRouter.use("/geo", geoRouter)

// AI road defect inspection endpoints mounted at /api/v1/ai and /api/ai
rootRouter.use("/v1/ai", aiRouter)
rootRouter.use("/ai", aiRouter)
