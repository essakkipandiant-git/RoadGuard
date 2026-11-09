import { Request, Response, NextFunction } from "express"
import { IssueService } from "../services/issueService"
import { RiskService } from "../services/riskService"
import { DuplicateService } from "../services/duplicateService"
import { AuditService } from "../services/auditService"
import {
  CreateIssueInput,
  ListIssuesQuery,
  SupportIssueInput,
  UpdateIssueStatusInput,
  UpdateOfficialInfoInput,
  IssueActionInput,
} from "../validators/issueValidators"

export class IssueController {
  /**
   * POST /api/v1/issues
   * Reports a new road issue with duplicate check & server-side risk scoring.
   */
  static async createIssue(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await IssueService.createIssue(req.user!.id, req.body as CreateIssueInput)

      await AuditService.logAction({
        userId: req.user!.id,
        action: "ISSUE_CREATED",
        entityType: "RoadIssue",
        entityId: result.issue.id,
        details: {
          reportNumber: result.issue.reportNumber,
          title: result.issue.title,
          damageCategory: result.issue.damageCategory,
          damageSeverity: result.issue.damageSeverity,
          riskScore: result.issue.riskScore,
        },
        ipAddress: req.ip,
      })

      res.status(201).json({
        success: true,
        data: {
          issue: result.issue,
        },
        message: "Road issue report created successfully.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/issues
   * Retrieves paginated road issues with filters and search.
   */
  static async getIssues(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await IssueService.getIssues(req.query as unknown as ListIssuesQuery)
      res.status(200).json({
        success: true,
        data: {
          issues: result.issues,
        },
        pagination: result.pagination,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/issues/my-reports
   * Retrieves all reports submitted by the authenticated citizen.
   */
  static async getMyReports(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const issues = await IssueService.getCitizenReports(req.user!.id)
      res.status(200).json({
        success: true,
        data: {
          issues,
        },
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/issues/:id
   * Retrieves an issue by UUID or reportNumber.
   */
  static async getIssueById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const issue = await IssueService.getIssueByIdOrReportNumber(id)
      res.status(200).json({
        success: true,
        data: {
          issue,
        },
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/issues/:id/support
   * Submits a community confirmation/support for an existing issue.
   */
  static async supportIssue(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const issue = await IssueService.supportIssue(
        id,
        req.user!.id,
        (req.body as SupportIssueInput)?.notes,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: "ISSUE_CONFIRMED",
        entityType: "RoadIssue",
        entityId: id,
        details: {
          confirmationsCount: issue.confirmationsCount,
          riskScore: issue.riskScore,
        },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: {
          issue,
        },
        message: "Community confirmation recorded. Defect urgency score updated.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/v1/issues/:id/status
   * Transitions an issue's status with role authorization.
   */
  static async updateIssueStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
      const issue = await IssueService.updateIssueStatus(
        id,
        req.user!,
        req.body as UpdateIssueStatusInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: "STATUS_TRANSITION",
        entityType: "RoadIssue",
        entityId: id,
        details: {
          status: issue.status,
          targetStatus: (req.body as UpdateIssueStatusInput).targetStatus,
          remarks: (req.body as UpdateIssueStatusInput).remarks,
          actorRole: req.user!.role,
        },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: {
          issue,
        },
        message: `Issue status updated to '${issue.status}'.`,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/issues/calculate-risk
   * Standalone explainable multi-factor risk assessment calculator.
   */
  static async calculateRisk(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const assessment = RiskService.assessRisk(req.body)
      res.status(200).json({
        success: true,
        data: assessment,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/issues/check-duplicate
   * Real-time spatial proximity duplicate pre-check for reporting modals.
   */
  static async checkDuplicate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { latitude, longitude, damageCategory, thresholdMeters } = req.body
      const result = await DuplicateService.findDuplicate(
        latitude,
        longitude,
        damageCategory,
        thresholdMeters,
      )
      res.status(200).json({
        success: true,
        data: result,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/issues/:id/timeline
   * Returns chronological recorded events for the issue.
   */
  static async getTimeline(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const data = await IssueService.getIssueTimeline(req.params.id as string)
      res.status(200).json({
        success: true,
        data,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/v1/issues/:id/official-info
   * Updates official government grievance reference & department details.
   */
  static async updateOfficialInfo(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updated = await IssueService.updateOfficialInfo(
        req.params.id as string,
        req.user!,
        req.body as UpdateOfficialInfoInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: "OFFICIAL_INFO_UPDATED",
        entityType: "RoadIssue",
        entityId: updated.id,
        details: {
          governmentReferenceId: updated.governmentReferenceId,
          governmentPortalUrl: updated.governmentPortalUrl,
          officialDepartmentName: updated.officialDepartmentName,
        },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: { issue: updated },
        message: "Official department information updated successfully.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/issues/:id/actions
   * Executes municipal lifecycle actions with audit trail and approval records.
   */
  static async executeAction(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await IssueService.executeAction(
        req.params.id as string,
        req.user!,
        req.body as IssueActionInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: result.approvalRecord.actionType,
        entityType: "RoadIssue",
        entityId: result.issue.id,
        details: {
          previousStatus: result.approvalRecord.previousStatus,
          newStatus: result.approvalRecord.newStatus,
          reason: result.approvalRecord.reason,
          remarks: result.approvalRecord.remarks,
        },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: result,
        message: `Action '${result.approvalRecord.actionType}' executed successfully.`,
      })
    } catch (error) {
      next(error)
    }
  }
}
