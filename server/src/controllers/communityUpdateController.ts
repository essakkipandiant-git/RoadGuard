import { Request, Response, NextFunction } from "express"
import { CommunityUpdateService } from "../services/communityUpdateService"
import { AuditService } from "../services/auditService"
import {
  CreateCommunityUpdateInput,
  ReviewCommunityUpdateInput,
} from "../validators/issueValidators"

export class CommunityUpdateController {
  /**
   * POST /api/v1/issues/:id/community-updates
   * Submit an observation / update on an existing defect report.
   */
  static async createUpdate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await CommunityUpdateService.createUpdate(
        req.params.id as string,
        req.user!,
        req.body as CreateCommunityUpdateInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: `COMMUNITY_UPDATE_${result.update.updateType}`,
        entityType: "IssueCommunityUpdate",
        entityId: result.update.id,
        details: {
          issueId: result.issue.id,
          reportNumber: result.issue.reportNumber,
          updateType: result.update.updateType,
          verificationStatus: result.update.verificationStatus,
        },
        ipAddress: req.ip,
      })

      res.status(201).json({
        success: true,
        data: result,
        message:
          result.update.updateType === "APPEARS_REPAIRED"
            ? "Repair claim submitted successfully and is pending municipal verification."
            : "Community observation recorded successfully.",
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * GET /api/v1/issues/:id/community-updates
   * Retrieves all community updates for a specific defect report.
   */
  static async getUpdates(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const updates = await CommunityUpdateService.getUpdates(req.params.id as string)
      res.status(200).json({
        success: true,
        data: { updates },
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/v1/issues/:id/community-updates/:updateId/review
   * Formally reviews, approves, or rejects a citizen community update / repair claim.
   */
  static async reviewUpdate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await CommunityUpdateService.reviewUpdate(
        req.params.id as string,
        req.params.updateId as string,
        req.user!,
        req.body as ReviewCommunityUpdateInput,
      )

      await AuditService.logAction({
        userId: req.user!.id,
        action: `COMMUNITY_UPDATE_REVIEW_${req.body.decision}`,
        entityType: "IssueCommunityUpdate",
        entityId: result.update.id,
        details: {
          issueId: result.issue.id,
          reportNumber: result.issue.reportNumber,
          decision: req.body.decision,
          adminRemarks: req.body.adminRemarks,
          newIssueStatus: result.issue.status,
        },
        ipAddress: req.ip,
      })

      res.status(200).json({
        success: true,
        data: result,
        message: `Citizen community update ${req.body.decision.toLowerCase()} successfully.`,
      })
    } catch (error) {
      next(error)
    }
  }
}

