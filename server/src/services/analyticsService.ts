import { DamageCategory, DamageSeverity, IssueStatus, Prisma, Role } from "@prisma/client"
import { prisma } from "../config/prisma"

export interface AnalyticsFilterParams {
  departmentId?: string
  wardId?: string
  startDate?: string
  endDate?: string
}

export interface DashboardMetrics {
  totalReported: number
  activeHazards: number
  criticalEmergencies: number
  repairsInProgress: number
  verifiedRepaired: number
  assigned: number
  underReview: number
  rejected: number
  averageRiskScore: number
  communityConfirmations: number
  wardBreakdown: Array<{
    wardId: string
    wardCode: string
    name: string
    count: number
    criticalCount: number
  }>
  departmentBreakdown: Array<{
    departmentId: string
    name: string
    count: number
  }>
  categoryBreakdown: Record<DamageCategory, number>
  severityBreakdown: Record<DamageSeverity, number>
}

export class AnalyticsService {
  /**
   * Calculates comprehensive operational metrics from live SQLite database records
   */
  static async getDashboardMetrics(filters: AnalyticsFilterParams = {}): Promise<DashboardMetrics> {
    const where: Prisma.RoadIssueWhereInput = {}

    if (filters.departmentId) {
      where.departmentId = filters.departmentId
    }

    if (filters.wardId) {
      where.wardId = filters.wardId
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {}
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate)
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate)
      }
    }

    // Parallel aggregate count queries for municipal SLA dashboards
    const [
      totalReported,
      activeHazards,
      criticalEmergencies,
      repairsInProgress,
      verifiedRepaired,
      assigned,
      underReview,
      rejected,
      riskAggregate,
      confirmationsAggregate,
      allWards,
      allDepartments,
      issuesForBreakdown,
    ] = await Promise.all([
      // Total count
      prisma.roadIssue.count({ where }),

      // Active hazards (excluding resolved and rejected)
      prisma.roadIssue.count({
        where: {
          ...where,
          status: {
            notIn: [IssueStatus.REPAIR_COMPLETED, IssueStatus.CLOSED, IssueStatus.REJECTED],
          },
        },
      }),

      // Critical emergencies currently active
      prisma.roadIssue.count({
        where: {
          ...where,
          damageSeverity: DamageSeverity.CRITICAL,
          status: {
            notIn: [IssueStatus.REPAIR_COMPLETED, IssueStatus.CLOSED, IssueStatus.REJECTED],
          },
        },
      }),

      // Work in progress
      prisma.roadIssue.count({
        where: {
          ...where,
          status: IssueStatus.IN_PROGRESS,
        },
      }),

      // Resolved / Repaired
      prisma.roadIssue.count({
        where: {
          ...where,
          status: {
            in: [IssueStatus.REPAIR_COMPLETED, IssueStatus.CLOSED],
          },
        },
      }),

      // Assigned to contractor/crew
      prisma.roadIssue.count({
        where: {
          ...where,
          status: IssueStatus.ASSIGNED,
        },
      }),

      // In initial review or verification
      prisma.roadIssue.count({
        where: {
          ...where,
          status: {
            in: [IssueStatus.REPORTED, IssueStatus.UNDER_REVIEW, IssueStatus.VERIFIED],
          },
        },
      }),

      // Rejected
      prisma.roadIssue.count({
        where: {
          ...where,
          status: IssueStatus.REJECTED,
        },
      }),

      // Average risk score calculation
      prisma.roadIssue.aggregate({
        where,
        _avg: {
          riskScore: true,
        },
      }),

      // Total citizen confirmations
      prisma.roadIssue.aggregate({
        where,
        _sum: {
          confirmationsCount: true,
        },
      }),

      // Wards list
      prisma.ward.findMany({
        where: { isActive: true },
        include: {
          issues: {
            where,
            select: {
              id: true,
              damageSeverity: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),

      // Departments list
      prisma.department.findMany({
        where: { isActive: true },
        include: {
          issues: {
            where,
            select: { id: true },
          },
        },
        orderBy: { name: "asc" },
      }),

      // Category and severity data
      prisma.roadIssue.findMany({
        where,
        select: {
          damageCategory: true,
          damageSeverity: true,
        },
      }),
    ])

    // Compute category breakdown
    const categoryBreakdown: Record<DamageCategory, number> = {
      CAVITY: 0,
      CRACK: 0,
      EDGE: 0,
      DEPRESSION: 0,
      RUTTING: 0,
    }

    // Compute severity breakdown
    const severityBreakdown: Record<DamageSeverity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MODERATE: 0,
      LOW: 0,
    }

    for (const issue of issuesForBreakdown) {
      if (issue.damageCategory in categoryBreakdown) {
        categoryBreakdown[issue.damageCategory]++
      }
      if (issue.damageSeverity in severityBreakdown) {
        severityBreakdown[issue.damageSeverity]++
      }
    }

    // Format ward breakdown
    const wardBreakdown = allWards.map((w) => ({
      wardId: w.id,
      wardCode: w.wardCode,
      name: w.name,
      count: w.issues.length,
      criticalCount: w.issues.filter((i) => i.damageSeverity === DamageSeverity.CRITICAL).length,
    }))

    // Format department breakdown
    const departmentBreakdown = allDepartments.map((d) => ({
      departmentId: d.id,
      name: d.name,
      count: d.issues.length,
    }))

    return {
      totalReported,
      activeHazards,
      criticalEmergencies,
      repairsInProgress,
      verifiedRepaired,
      assigned,
      underReview,
      rejected,
      averageRiskScore: Math.round(riskAggregate._avg.riskScore || 0),
      communityConfirmations: confirmationsAggregate._sum.confirmationsCount || 0,
      wardBreakdown,
      departmentBreakdown,
      categoryBreakdown,
      severityBreakdown,
    }
  }

  /**
   * Retrieves active departments, wards, and available inspectors/staff for selection dropdowns
   */
  static async getMunicipalMetadata() {
    const [departments, wards, inspectors] = await Promise.all([
      prisma.department.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          description: true,
          contactEmail: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.ward.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          wardCode: true,
          city: true,
          departmentId: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: [Role.INSPECTOR, Role.DEPARTMENT_ADMIN, Role.SUPER_ADMIN] },
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          departmentId: true,
          phoneNumber: true,
        },
        orderBy: { fullName: "asc" },
      }),
    ])

    return {
      departments,
      wards,
      inspectors,
    }
  }
}

