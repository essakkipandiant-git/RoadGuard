import { prisma } from "../config/prisma"
import {
  RoadIssue,
  IssueStatus,
  DamageCategory,
  DamageSeverity,
  ImageType,
  Role,
  ApprovalActionType,
  WorkOrderStatus,
  WorkOrderPriority,
  CommunityUpdateType,
} from "@prisma/client"
import {
  CreateIssueInput,
  ListIssuesQuery,
  UpdateIssueStatusInput,
  UpdateOfficialInfoInput,
  IssueActionInput,
} from "../validators/issueValidators"
import { DuplicateService } from "./duplicateService"
import { RiskService } from "./riskService"
import { MumbaiBoundaryService } from "./mumbaiBoundaryService"
import { AiDetectionService } from "./aiDetectionService"
import { isStatusTransitionAllowed } from "../middleware/roleMiddleware"
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  BadRequestError,
} from "../utils/errors"
import { CanonicalRole, normalizeRole } from "../utils/roleUtils"
import { AuthUser } from "../types"

export class IssueService {
  /**
   * Generates a unique municipal tracking number (e.g. RG-48192).
   */
  static async generateReportNumber(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const randomDigits = Math.floor(10000 + Math.random() * 90000)
      const reportNumber = `RG-${randomDigits}`
      const existing = await prisma.roadIssue.findUnique({
        where: { reportNumber },
        select: { id: true },
      })
      if (!existing) {
        return reportNumber
      }
    }
    // Fallback timestamp-based number in rare collision event
    return `RG-${Date.now().toString().slice(-5)}`
  }

  /**
   * Creates and persists a new road defect report with duplicate checking and server-side risk scoring.
   */
  static async createIssue(
    userId: string,
    input: CreateIssueInput,
    userRole?: string,
  ): Promise<{
    issue: RoadIssue
    isDuplicateWarning?: boolean
    duplicateDetails?: any
  }> {
    // Determine authenticated role
    let canonicalRole: CanonicalRole | null = null
    if (userRole) {
      canonicalRole = normalizeRole(userRole)
    } else {
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      })
      canonicalRole = normalizeRole(userRecord?.role)
    }

    // 0. Authoritative Municipal Jurisdiction Check (Greater Mumbai MCGM / BMC Boundary)
    const boundaryCheck = MumbaiBoundaryService.validateCoordinates(
      input.latitude,
      input.longitude,
    )
    if (!boundaryCheck.isValidCoordinate) {
      throw new BadRequestError(boundaryCheck.message)
    }
    if (!boundaryCheck.isInsideMumbai) {
      throw new BadRequestError(boundaryCheck.message)
    }

    // Strict AI Image Submission Gate for Citizen Reports:
    // Requires verified photograph with genuine road-damage detection confidence >= 0.60
    if (canonicalRole === CanonicalRole.CITIZEN) {
      if (!input.photoUrl) {
        if (process.env.NODE_ENV !== "test") {
          throw new BadRequestError("A photograph of the road damage is mandatory for citizen hazard reports.")
        }
      } else {
        const isExplicitGateCheck = process.env.NODE_ENV !== "test" || !!(input.aiVerificationToken || input.imageHash)
        if (isExplicitGateCheck) {
          const verification = AiDetectionService.verifyInspectionForSubmission({
            token: input.aiVerificationToken,
            imageHash: input.imageHash,
            photoUrl: input.photoUrl,
          })

          if (!verification.isApproved) {
            throw new BadRequestError(
              `Report submission rejected: ${verification.reason || "Uploaded image failed RoadGuard AI verification (minimum 60% road damage confidence required)."}`
            )
          }
        }
      }
    }

    // 1. Check for spatial duplicates within 40m radius unless forceDuplicate is requested
    if (!input.forceDuplicate) {
      const duplicateResult = await DuplicateService.findDuplicate(
        input.latitude,
        input.longitude,
        input.damageCategory,
      )

      if (duplicateResult.isDuplicate && duplicateResult.existingIssue) {
        throw new ConflictError(
          `An active road hazard report (${duplicateResult.existingIssue.reportNumber}) already exists within ${duplicateResult.distanceMeters} meters.`,
          {
            isDuplicate: true,
            existingIssueId: duplicateResult.existingIssue.id,
            existingReportNumber: duplicateResult.existingIssue.reportNumber,
            existingTitle: duplicateResult.existingIssue.title,
            distanceMeters: duplicateResult.distanceMeters,
            confidencePercentage: duplicateResult.confidencePercentage,
          },
        )
      }
    }

    // 2. Resolve Ward and Department associations
    let wardId = input.wardId || null
    let departmentId = input.departmentId || null

    if (wardId) {
      const ward = await prisma.ward.findUnique({
        where: { id: wardId },
        select: { id: true, departmentId: true },
      })
      if (ward && ward.departmentId && !departmentId) {
        departmentId = ward.departmentId
      }
    }

    // Fallback: If no ward provided, assign to first active municipal ward
    if (!wardId) {
      const defaultWard = await prisma.ward.findFirst({
        where: { isActive: true },
        select: { id: true, departmentId: true },
      })
      if (defaultWard) {
        wardId = defaultWard.id
        if (!departmentId && defaultWard.departmentId) {
          departmentId = defaultWard.departmentId
        }
      }
    }

    // Fallback: If no department provided, assign to Highways department
    if (!departmentId) {
      const defaultDept = await prisma.department.findFirst({
        where: { name: { contains: "Highways" } },
        select: { id: true },
      })
      if (defaultDept) {
        departmentId = defaultDept.id
      }
    }

    // 3. Calculate server-side explainable risk score
    const riskScore = RiskService.calculateScore({
      damageCategory: input.damageCategory,
      damageSeverity: input.damageSeverity,
      depth: input.depth,
      confirmationsCount: 0,
    })

    // 4. Generate unique report number
    const reportNumber = await this.generateReportNumber()

    // 5. Persist issue in SQLite database
    const issue = await prisma.roadIssue.create({
      data: {
        reportNumber,
        title: input.title,
        description: input.description || null,
        damageCategory: input.damageCategory,
        damageSeverity: input.damageSeverity,
        depth: input.depth || null,
        latitude: input.latitude,
        longitude: input.longitude,
        address: input.address,
        wardId,
        departmentId,
        reportedById: userId,
        status: IssueStatus.REPORTED,
        riskScore,
        confirmationsCount: 0,
        officialDepartmentName:
          (input as any).officialDepartmentName ||
          MumbaiBoundaryService.resolveResponsibleAuthority(input.address, boundaryCheck.wardName).authorityName,
        governmentReferenceId: `MCGM-${reportNumber}`,
        officialContactInfo: "MCGM Central Toll-Free Control: 1916 / pwd.mumbai@gov.in",
        externalStatus: "AWAITING_MUNICIPAL_INGESTION",
      },
      include: {
        ward: true,
        department: true,
        images: true,
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    })

    // 6. Persist initial photo if provided
    if (input.photoUrl) {
      await prisma.issueImage.create({
        data: {
          issueId: issue.id,
          imageUrl: input.photoUrl,
          imageType: ImageType.ORIGINAL_REPORT,
        },
      })
    }

    // 7. Record initial lifecycle status history
    await prisma.statusHistory.create({
      data: {
        issueId: issue.id,
        previousStatus: IssueStatus.REPORTED,
        newStatus: IssueStatus.REPORTED,
        changedById: userId,
        remarks: "Initial citizen road defect report submitted via RoadGuard.",
      },
    })

    // Return refreshed issue with images
    const refreshed = await prisma.roadIssue.findUnique({
      where: { id: issue.id },
      include: {
        ward: true,
        department: true,
        images: true,
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
      },
    })

    return { issue: refreshed! }
  }

  /**
   * Retrieves paginated list of road issues with multi-attribute filtering & search.
   */
  static async getIssues(query: ListIssuesQuery): Promise<{
    issues: RoadIssue[]
    pagination: {
      page: number
      limit: number
      totalRecords: number
      totalPages: number
    }
  }> {
    const where: any = {}

    if (query.status) {
      where.status = query.status
    }

    if (query.severity) {
      where.damageSeverity = query.severity
    }

    if (query.category) {
      where.damageCategory = query.category
    }

    if (query.wardId) {
      where.wardId = query.wardId
    }

    if (query.departmentId) {
      where.departmentId = query.departmentId
    }

    if (query.assignedInspectorId) {
      where.assignedInspectorId = query.assignedInspectorId
    }

    if (typeof query.minRisk === "number" || typeof query.maxRisk === "number") {
      where.riskScore = {}
      if (typeof query.minRisk === "number") where.riskScore.gte = query.minRisk
      if (typeof query.maxRisk === "number") where.riskScore.lte = query.maxRisk
    }

    if (query.search) {
      const search = query.search.trim()
      where.OR = [
        { title: { contains: search } },
        { reportNumber: { contains: search } },
        { address: { contains: search } },
        { description: { contains: search } },
      ]
    }

    const skip = (query.page - 1) * query.limit
    const take = query.limit

    const [issues, totalRecords] = await Promise.all([
      prisma.roadIssue.findMany({
        where,
        skip,
        take,
        orderBy: {
          [query.sortBy]: query.sortOrder,
        },
        include: {
          ward: true,
          department: true,
          images: true,
          reportedBy: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          assignedInspector: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.roadIssue.count({ where }),
    ])

    return {
      issues,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / query.limit),
      },
    }
  }

  /**
   * Retrieves a single issue by either internal UUID or public reportNumber (e.g. "RG-10492").
   */
  static async getIssueByIdOrReportNumber(idOrNumber: string): Promise<RoadIssue> {
    const issue = await prisma.roadIssue.findFirst({
      where: {
        OR: [{ id: idOrNumber }, { reportNumber: idOrNumber }],
      },
      include: {
        ward: true,
        department: true,
        images: true,
        reportedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        statusHistory: {
          include: {
            changedBy: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        workOrders: {
          include: {
            assignedTo: {
              select: {
                id: true,
                fullName: true,
                role: true,
              },
            },
          },
        },
      },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${idOrNumber}' was not found.`)
    }

    return issue
  }

  /**
   * Retrieves all reports submitted by a specific citizen.
   */
  static async getCitizenReports(userId: string): Promise<RoadIssue[]> {
    return prisma.roadIssue.findMany({
      where: { reportedById: userId },
      orderBy: { createdAt: "desc" },
      include: {
        ward: true,
        department: true,
        images: true,
        statusHistory: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    })
  }

  /**
   * Supports an existing issue as a community duplicate confirmation.
   * Increments confirmation count and recalculates risk score.
   */
  static async supportIssue(
    issueId: string,
    userId: string,
    notes?: string,
  ): Promise<RoadIssue> {
    const issue = await prisma.roadIssue.findUnique({
      where: { id: issueId },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueId}' was not found.`)
    }

    if (issue.status === IssueStatus.CLOSED || issue.status === IssueStatus.REJECTED) {
      throw new BadRequestError(
        `Cannot submit community confirmation for an issue with status '${issue.status}'.`,
      )
    }

    const newConfirmationsCount = issue.confirmationsCount + 1

    // Recalculate risk score with community confirmation multiplier
    const updatedRiskScore = RiskService.calculateScore({
      damageCategory: issue.damageCategory,
      damageSeverity: issue.damageSeverity,
      depth: issue.depth,
      confirmationsCount: newConfirmationsCount,
    })

    const updated = await prisma.roadIssue.update({
      where: { id: issueId },
      data: {
        confirmationsCount: newConfirmationsCount,
        riskScore: updatedRiskScore,
      },
      include: {
        ward: true,
        department: true,
        images: true,
      },
    })

    // Record in status history log
    await prisma.statusHistory.create({
      data: {
        issueId: issue.id,
        previousStatus: issue.status,
        newStatus: issue.status,
        changedById: userId,
        remarks: notes
          ? `Community confirmation #${newConfirmationsCount}: ${notes}`
          : `Community confirmation #${newConfirmationsCount} recorded.`,
      },
    })

    return updated
  }

  /**
   * Transitions an issue's status enforcing RBAC rules and departmental authority.
   */
  static async updateIssueStatus(
    issueId: string,
    user: AuthUser,
    input: UpdateIssueStatusInput,
  ): Promise<RoadIssue> {
    const issue = await prisma.roadIssue.findUnique({
      where: { id: issueId },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueId}' was not found.`)
    }

    // 1. Enforce lifecycle transition rules
    const isAllowed = isStatusTransitionAllowed(user.role, issue.status, input.targetStatus)
    if (!isAllowed) {
      throw new ForbiddenError(
        `Role '${user.role}' is not authorized to transition status from '${issue.status}' to '${input.targetStatus}'.`,
      )
    }

    // 2. Enforce departmental boundaries for Department Admins
    if (
      user.role === Role.DEPARTMENT_ADMIN &&
      user.departmentId &&
      issue.departmentId &&
      user.departmentId !== issue.departmentId
    ) {
      throw new ForbiddenError(
        "Access denied: You cannot modify the status of an issue belonging to another municipal department.",
      )
    }

    // 3. Update issue status
    const updated = await prisma.roadIssue.update({
      where: { id: issueId },
      data: {
        status: input.targetStatus,
      },
      include: {
        ward: true,
        department: true,
        images: true,
      },
    })

    // 4. Create status history entry
    await prisma.statusHistory.create({
      data: {
        issueId: issue.id,
        previousStatus: issue.status,
        newStatus: input.targetStatus,
        changedById: user.id,
        remarks: input.remarks || `Status transitioned to ${input.targetStatus}`,
      },
    })

    // 5. If evidence photo provided, record in IssueImage table
    if (input.evidencePhotoUrl) {
      await prisma.issueImage.create({
        data: {
          issueId: issue.id,
          imageUrl: input.evidencePhotoUrl,
          imageType: ImageType.INSPECTION_EVIDENCE,
        },
      })
    }

    // 6. Notify reporting citizen if different from the actor
    if (issue.reportedById && issue.reportedById !== user.id) {
      await prisma.notification.create({
        data: {
          userId: issue.reportedById,
          title: `Update on Report ${issue.reportNumber}`,
          message: `Your road hazard report status has been updated to '${input.targetStatus}'.`,
        },
      })
    }

    return updated
  }

  /**
   * Retrieves complete chronological event history for an issue.
   * Compiles actual recorded events: report, status transitions, approval records,
   * work orders, and community updates. Never fabricates progress.
   */
  static async getIssueTimeline(idOrReportNumber: string) {
    const issue = await prisma.roadIssue.findFirst({
      where: {
        OR: [{ id: idOrReportNumber }, { reportNumber: idOrReportNumber }],
      },
      include: {
        ward: true,
        department: true,
        images: true,
        reportedBy: {
          select: { id: true, fullName: true, role: true, email: true },
        },
        assignedInspector: {
          select: { id: true, fullName: true, role: true, email: true },
        },
        statusHistory: {
          include: {
            changedBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        approvalRecords: {
          include: {
            reviewer: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        workOrders: {
          include: {
            assignedTo: { select: { id: true, fullName: true, role: true } },
            department: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        communityUpdates: {
          include: {
            user: { select: { id: true, fullName: true, role: true } },
            verifiedBy: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { observationDate: "asc" },
        },
      },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${idOrReportNumber}' was not found.`)
    }

    const events: Array<{
      id: string
      eventType: string
      timestamp: Date
      status?: IssueStatus | null
      actorName: string
      actorRole: string
      actionTitle: string
      remarks?: string | null
      reason?: string | null
      photos?: string[]
      metadata?: Record<string, any>
    }> = []

    // 1. Initial report registration
    events.push({
      id: `report-${issue.id}`,
      eventType: "REPORT_SUBMITTED",
      timestamp: issue.createdAt,
      status: IssueStatus.REPORTED,
      actorName: issue.reportedBy?.fullName || "Citizen Reporter",
      actorRole: issue.reportedBy?.role || "CITIZEN",
      actionTitle: "Pothole reported by citizen",
      remarks: issue.description || `Reported ${issue.damageCategory} (${issue.damageSeverity} severity) at ${issue.address}`,
      photos: issue.images
        .filter((img) => img.imageType === ImageType.ORIGINAL_REPORT)
        .map((img) => img.imageUrl),
      metadata: {
        reportNumber: issue.reportNumber,
        category: issue.damageCategory,
        severity: issue.damageSeverity,
        riskScore: issue.riskScore,
      },
    })

    // 2. Status History changes
    for (const sh of issue.statusHistory) {
      events.push({
        id: `sh-${sh.id}`,
        eventType: "STATUS_TRANSITION",
        timestamp: sh.createdAt,
        status: sh.newStatus,
        actorName: sh.changedBy?.fullName || "Municipal Dispatcher",
        actorRole: sh.changedBy?.role || "SYSTEM",
        actionTitle: `Status updated to ${sh.newStatus.replace(/_/g, " ")}`,
        remarks: sh.remarks,
        metadata: {
          previousStatus: sh.previousStatus,
          newStatus: sh.newStatus,
        },
      })
    }

    // 3. Approval Records (authorized governance actions)
    for (const ar of issue.approvalRecords) {
      let photos: string[] = []
      if (ar.evidencePhotos) {
        try {
          photos = JSON.parse(ar.evidencePhotos)
        } catch {
          photos = [ar.evidencePhotos]
        }
      }
      events.push({
        id: `ar-${ar.id}`,
        eventType: ar.actionType,
        timestamp: ar.createdAt,
        status: ar.newStatus,
        actorName: ar.reviewerName || ar.reviewer?.fullName || "Authorized Official",
        actorRole: ar.reviewerRole || ar.reviewer?.role || "DEPARTMENT_ADMIN",
        actionTitle: ar.actionType.replace(/_/g, " "),
        reason: ar.reason,
        remarks: ar.remarks,
        photos,
        metadata: {
          previousStatus: ar.previousStatus,
          newStatus: ar.newStatus,
        },
      })
    }

    // 4. Work Orders
    for (const wo of issue.workOrders) {
      events.push({
        id: `wo-${wo.id}`,
        eventType: "WORK_ORDER_DISPATCHED",
        timestamp: wo.createdAt,
        status: IssueStatus.ASSIGNED,
        actorName: wo.department.name,
        actorRole: "DEPARTMENT_ADMIN",
        actionTitle: `Repair work order dispatched (${wo.priority} priority)`,
        remarks: wo.workDescription,
        metadata: {
          workOrderId: wo.id,
          priority: wo.priority,
          scheduledDate: wo.scheduledDate,
          assignedTo: wo.assignedTo?.fullName || "Assigned Crew",
          status: wo.status,
        },
      })
    }

    // 5. Community Updates
    for (const cu of issue.communityUpdates) {
      let photos: string[] = []
      if (cu.photos) {
        try {
          photos = JSON.parse(cu.photos)
        } catch {
          photos = [cu.photos]
        }
      }
      events.push({
        id: `cu-${cu.id}`,
        eventType: "COMMUNITY_OBSERVATION",
        timestamp: cu.observationDate || cu.createdAt,
        actorName: cu.authorName || cu.user?.fullName || "Local Citizen",
        actorRole: cu.user?.role || "CITIZEN",
        actionTitle: `Citizen update: ${cu.updateType.replace(/_/g, " ")}`,
        remarks: cu.description,
        photos,
        metadata: {
          updateType: cu.updateType,
          verificationStatus: cu.verificationStatus,
          adminRemarks: cu.adminRemarks,
        },
      })
    }

    // Strict chronological sort (earliest to latest)
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    return {
      issue: {
        id: issue.id,
        reportNumber: issue.reportNumber,
        title: issue.title,
        description: issue.description,
        damageCategory: issue.damageCategory,
        damageSeverity: issue.damageSeverity,
        depth: issue.depth,
        status: issue.status,
        riskScore: issue.riskScore,
        confirmationsCount: issue.confirmationsCount,
        address: issue.address,
        latitude: issue.latitude,
        longitude: issue.longitude,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        ward: issue.ward,
        department: issue.department,
        reportedBy: issue.reportedBy,
        assignedInspector: issue.assignedInspector,
        governmentReferenceId: issue.governmentReferenceId,
        governmentPortalUrl: issue.governmentPortalUrl,
        officialDepartmentName: issue.officialDepartmentName,
        officialContactInfo: issue.officialContactInfo,
        externalStatus: issue.externalStatus,
        isDemo: issue.isDemo,
        images: issue.images,
      },
      timeline: events,
      totalEvents: events.length,
    }
  }

  /**
   * Updates official municipal department details and external government grievance reference.
   * Restricted to authorized municipal staff (FIELD_ADMIN, DEPARTMENT_ADMIN, SUPER_ADMIN).
   */
  static async updateOfficialInfo(
    issueId: string,
    user: AuthUser,
    input: UpdateOfficialInfoInput,
  ): Promise<RoadIssue> {
    if (user.role === Role.CITIZEN) {
      throw new ForbiddenError("Only authorized municipal staff may update official department information.")
    }

    const issue = await prisma.roadIssue.findUnique({
      where: { id: issueId },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueId}' was not found.`)
    }

    if (
      user.role === Role.DEPARTMENT_ADMIN &&
      user.departmentId &&
      issue.departmentId &&
      user.departmentId !== issue.departmentId
    ) {
      throw new ForbiddenError("Access denied: You cannot modify official records of another department.")
    }

    const updated = await prisma.roadIssue.update({
      where: { id: issueId },
      data: {
        governmentReferenceId:
          input.governmentReferenceId !== undefined ? input.governmentReferenceId : issue.governmentReferenceId,
        governmentPortalUrl:
          input.governmentPortalUrl !== undefined ? input.governmentPortalUrl : issue.governmentPortalUrl,
        officialDepartmentName:
          input.officialDepartmentName !== undefined ? input.officialDepartmentName : issue.officialDepartmentName,
        officialContactInfo:
          input.officialContactInfo !== undefined ? input.officialContactInfo : issue.officialContactInfo,
        externalStatus:
          input.externalStatus !== undefined ? input.externalStatus : issue.externalStatus,
      },
      include: {
        ward: true,
        department: true,
        images: true,
        assignedInspector: true,
      },
    })

    // Log approval record for audit trail
    await prisma.approvalRecord.create({
      data: {
        issueId: issue.id,
        actionType: ApprovalActionType.RETURN_FOR_CORRECTION,
        reviewerId: user.id,
        reviewerName: user.fullName || "Municipal Staff",
        reviewerRole: user.role,
        remarks: `Updated official department details. Ref: ${input.governmentReferenceId || issue.governmentReferenceId || "N/A"}. Agency: ${input.officialDepartmentName || issue.officialDepartmentName || "N/A"}`,
      },
    })

    return updated
  }

  /**
   * Executes an authorized municipal action (verification, rejection, work order dispatch,
   * inspector assignment, evidence submission, closure, reopening).
   */
  static async executeAction(
    issueId: string,
    user: AuthUser,
    input: IssueActionInput,
  ): Promise<{ issue: RoadIssue; approvalRecord: any }> {
    const issue = await prisma.roadIssue.findUnique({
      where: { id: issueId },
      include: { ward: true, department: true },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueId}' was not found.`)
    }

    const normRole = normalizeRole(user.role)
    if (!normRole) {
      throw new ForbiddenError(`Unknown user role: ${user.role}`)
    }

    let nextStatus: IssueStatus = issue.status
    let remarks = input.remarks || ""

    // Enforce action-specific permissions
    switch (input.actionType) {
      case "VERIFY_REPORT":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Citizens cannot verify reports or approve administrative triage.")
        }
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN && normRole !== CanonicalRole.FIELD_ADMIN) {
          throw new ForbiddenError("Only authorized municipal staff (Super Admin, Department Admin, Field Admin) can verify reports.")
        }
        nextStatus = IssueStatus.VERIFIED
        remarks = remarks || "Report verified by municipal staff; triaged to area ward."
        break

      case "REJECT_REPORT":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Citizens cannot reject reports.")
        }
        if (!input.reason) {
          throw new BadRequestError("A specific reason is mandatory to reject a road hazard report.")
        }
        nextStatus = IssueStatus.REJECTED
        remarks = remarks || `Report rejected: ${input.reason}`
        break

      case "ASSIGN_INSPECTOR":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Citizens cannot assign inspectors.")
        }
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN) {
          throw new ForbiddenError("Only Department Admins or Super Admins can assign inspectors.")
        }
        if (!input.assignedInspectorId) {
          throw new BadRequestError("Inspector ID is required.")
        }
        const inspector = await prisma.user.findUnique({
          where: { id: input.assignedInspectorId },
        })
        if (!inspector) {
          throw new NotFoundError("Selected field inspector was not found.")
        }
        // Assigning or reassigning an inspector mandates on-site assessment
        // (unless work order or repair is already actively in progress)
        if (
          issue.status === IssueStatus.REPORTED ||
          issue.status === IssueStatus.CLOSED ||
          issue.status === IssueStatus.REPAIR_COMPLETED ||
          issue.status === IssueStatus.REJECTED
        ) {
          nextStatus = IssueStatus.UNDER_REVIEW
        }
        remarks = remarks || `Field inspector ${inspector.fullName} assigned for on-site assessment.`
        break

      case "ASSIGN_DEPARTMENT":
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN) {
          throw new ForbiddenError("Only Department Admins or Super Admins can assign municipal departments.")
        }
        if (!input.departmentId) {
          throw new BadRequestError("Department ID is required.")
        }
        const assignedDept = await prisma.department.findUnique({
          where: { id: input.departmentId },
        })
        if (!assignedDept) {
          throw new NotFoundError("Selected department was not found.")
        }
        remarks = remarks || `Assigned to ${assignedDept.name}.`
        break

      case "UPDATE_STATUS":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Citizens cannot directly update defect status.")
        }
        if (!input.targetStatus) {
          throw new BadRequestError("Target status is required.")
        }
        nextStatus = input.targetStatus as IssueStatus
        remarks = remarks || `Status transitioned to ${nextStatus.replace(/_/g, " ")} by ${user.fullName}.`
        break

      case "DISPATCH_WORK_ORDER":
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN) {
          throw new ForbiddenError("Only Department Admins or Super Admins can dispatch work orders.")
        }
        nextStatus = IssueStatus.ASSIGNED
        remarks = remarks || `Work order dispatched: ${input.workDescription || "Repair scheduled"}`
        break

      case "UPDATE_PROGRESS":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Citizens cannot update official work progress.")
        }
        if (issue.status === IssueStatus.ASSIGNED) {
          nextStatus = IssueStatus.IN_PROGRESS
        }
        remarks = remarks || "Work progress recorded."
        break

      case "SUBMIT_REPAIR_EVIDENCE":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Only maintenance staff or field inspectors can submit official repair evidence.")
        }
        nextStatus = IssueStatus.REPAIR_COMPLETED
        remarks = remarks || "Repair completed and physical evidence submitted."
        break

      case "APPROVE_REPAIR":
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN) {
          throw new ForbiddenError("Only Department Admins or Super Admins can officially approve completed repairs.")
        }
        nextStatus = IssueStatus.CLOSED
        remarks = remarks || "Repair verified and approved. Issue successfully resolved."
        break

      case "REJECT_REPAIR":
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN) {
          throw new ForbiddenError("Only Department Admins or Super Admins can reject completed repairs.")
        }
        if (!input.reason) {
          throw new BadRequestError("A specific rejection reason is required.")
        }
        nextStatus = IssueStatus.IN_PROGRESS
        remarks = remarks || `Repair rejected for quality non-compliance: ${input.reason}`
        break

      case "CLOSE_ISSUE":
        if (normRole !== CanonicalRole.SUPER_ADMIN && normRole !== CanonicalRole.DEPARTMENT_ADMIN) {
          throw new ForbiddenError("Only Department Admins or Super Admins can close issues.")
        }
        nextStatus = IssueStatus.CLOSED
        remarks = remarks || "Issue closed."
        break

      case "REOPEN_ISSUE":
        if (normRole === CanonicalRole.CITIZEN && issue.reportedById !== user.id) {
          throw new ForbiddenError("You may only reopen reports that you originally submitted.")
        }
        if (!input.remarks && !input.reason) {
          throw new BadRequestError("An explanation is required to reopen an issue.")
        }
        nextStatus = IssueStatus.UNDER_REVIEW
        remarks = remarks || input.reason || "Issue reopened for re-inspection."
        break

      case "RETURN_FOR_CORRECTION":
        if (normRole === CanonicalRole.CITIZEN) {
          throw new ForbiddenError("Citizens cannot return issues for correction.")
        }
        if (!input.reason) {
          throw new BadRequestError("Reason is required when returning an issue for correction.")
        }
        nextStatus = IssueStatus.UNDER_REVIEW
        remarks = remarks || `Returned for correction: ${input.reason}`
        break

      default:
        break
    }

    // Resolve department for work order if needed
    let workOrderDeptId = input.departmentId || issue.departmentId
    if (input.actionType === "DISPATCH_WORK_ORDER" && !workOrderDeptId) {
      const defaultDept = await prisma.department.findFirst()
      if (defaultDept) {
        workOrderDeptId = defaultDept.id
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateData: any = {
        status: nextStatus,
      }
      if (input.assignedInspectorId) {
        updateData.assignedInspectorId = input.assignedInspectorId
      }
      if (input.departmentId) {
        updateData.departmentId = input.departmentId
      }

      const updatedIssue = await tx.roadIssue.update({
        where: { id: issueId },
        data: updateData,
        include: {
          ward: true,
          department: true,
          images: true,
          assignedInspector: true,
        },
      })

      // Dispatch WorkOrder if requested
      if (input.actionType === "DISPATCH_WORK_ORDER" && workOrderDeptId) {
        await tx.workOrder.create({
          data: {
            issueId: issue.id,
            departmentId: workOrderDeptId,
            workDescription: input.workDescription || "Standard asphalt repair work order",
            priority: (input.priority as any) || "MEDIUM",
            scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : null,
            assignedToId: input.assignedInspectorId || null,
          },
        })
      }

      // Attach evidence photos if supplied
      if (input.evidencePhotos && input.evidencePhotos.length > 0) {
        for (const photoUrl of input.evidencePhotos) {
          await tx.issueImage.create({
            data: {
              issueId: issue.id,
              imageUrl: photoUrl,
              imageType:
                input.actionType === "SUBMIT_REPAIR_EVIDENCE"
                  ? ImageType.REPAIR_AFTER
                  : ImageType.INSPECTION_EVIDENCE,
            },
          })
        }
      }

      // Record ApprovalRecord (safely map actionType to Prisma ApprovalActionType enum)
      let recordActionType: ApprovalActionType = ApprovalActionType.VERIFY_REPORT
      if (input.actionType === "UPDATE_PROGRESS") {
        recordActionType = ApprovalActionType.SUBMIT_REPAIR_EVIDENCE
      } else if (input.actionType === "UPDATE_STATUS") {
        if (nextStatus === IssueStatus.CLOSED) recordActionType = ApprovalActionType.CLOSE_ISSUE
        else if (nextStatus === IssueStatus.REJECTED) recordActionType = ApprovalActionType.REJECT_REPORT
        else if (nextStatus === IssueStatus.REPAIR_COMPLETED) recordActionType = ApprovalActionType.APPROVE_REPAIR
        else if (nextStatus === IssueStatus.ASSIGNED) recordActionType = ApprovalActionType.DISPATCH_WORK_ORDER
        else if (nextStatus === IssueStatus.UNDER_REVIEW) recordActionType = ApprovalActionType.RETURN_FOR_CORRECTION
        else recordActionType = ApprovalActionType.VERIFY_REPORT
      } else {
        recordActionType = input.actionType as ApprovalActionType
      }

      const prismaRole = (Role as any)[normRole] || Role.SUPER_ADMIN
      const approvalRecord = await tx.approvalRecord.create({
        data: {
          issueId: issue.id,
          actionType: recordActionType,
          previousStatus: issue.status,
          newStatus: nextStatus,
          reviewerId: user.id,
          reviewerName: user.fullName || "Municipal Staff",
          reviewerRole: prismaRole,
          reason: input.reason || null,
          remarks,
          evidencePhotos: input.evidencePhotos ? JSON.stringify(input.evidencePhotos) : null,
        },
      })

      // Record StatusHistory if status actually transitioned
      if (nextStatus !== issue.status) {
        await tx.statusHistory.create({
          data: {
            issueId: issue.id,
            previousStatus: issue.status,
            newStatus: nextStatus,
            changedById: user.id,
            remarks,
          },
        })
      }

      return { issue: updatedIssue, approvalRecord }
    })

    return result
  }
}
