import { Prisma } from "@prisma/client"
import { prisma } from "../config/prisma"
import { logger } from "../utils/logger"

export interface LogActionParams {
  userId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  details?: Record<string, any> | string | null
  ipAddress?: string | null
}

export interface GetAuditLogsParams {
  page?: number
  limit?: number
  action?: string
  entityType?: string
  userId?: string
  startDate?: string
  endDate?: string
}

export class AuditService {
  /**
   * Persists an immutable audit log record to SQLite database for municipal governance.
   */
  static async logAction(params: LogActionParams): Promise<void> {
    try {
      const detailsString =
        typeof params.details === "object" && params.details !== null
          ? JSON.stringify(params.details)
          : (params.details as string | undefined)

      let validUserId: string | undefined = undefined
      if (params.userId) {
        const userExists = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { id: true },
        })
        if (userExists) {
          validUserId = userExists.id
        }
      }

      try {
        await prisma.auditLog.create({
          data: {
            userId: validUserId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId || undefined,
            details: detailsString,
            ipAddress: params.ipAddress || undefined,
          },
        })
      } catch (createError: any) {
        if (createError?.code === "P2003" && validUserId) {
          // Foreign key violation due to concurrent user deletion; persist with null userId
          await prisma.auditLog.create({
            data: {
              userId: undefined,
              action: params.action,
              entityType: params.entityType,
              entityId: params.entityId || undefined,
              details: detailsString,
              ipAddress: params.ipAddress || undefined,
            },
          })
        } else {
          throw createError
        }
      }
    } catch (error) {
      // Never let an audit logging failure crash the primary business transaction
      logger.error("Failed to persist audit log entry:", error)
    }
  }

  /**
   * Queries paginated audit logs for system administrators.
   */
  static async getLogs(params: GetAuditLogsParams = {}) {
    const page = Math.max(1, params.page || 1)
    const limit = Math.min(100, Math.max(1, params.limit || 20))
    const skip = (page - 1) * limit

    const where: Prisma.AuditLogWhereInput = {}

    if (params.action) {
      where.action = params.action
    }

    if (params.entityType) {
      where.entityType = params.entityType
    }

    if (params.userId) {
      where.userId = params.userId
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {}
      if (params.startDate) where.createdAt.gte = new Date(params.startDate)
      if (params.endDate) where.createdAt.lte = new Date(params.endDate)
    }

    const [totalRecords, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
    ])

    return {
      logs: logs.map((log) => ({
        ...log,
        details: (() => {
          if (!log.details) return null
          try {
            return JSON.parse(log.details)
          } catch {
            return log.details
          }
        })(),
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1,
      },
    }
  }
}
