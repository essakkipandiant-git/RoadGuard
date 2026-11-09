import { prisma } from "../config/prisma"
import {
  IssueStatus,
  CommunityUpdateType,
  VerificationStatus,
  ApprovalActionType,
  Role,
} from "@prisma/client"
import {
  CreateCommunityUpdateInput,
  ReviewCommunityUpdateInput,
} from "../validators/issueValidators"
import { RiskService } from "./riskService"
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors"
import { AuthUser } from "../types"

export class CommunityUpdateService {
  /**
   * Submits a community observation / update for an existing road issue.
   * Handles "STILL_EXISTS", "WORSENED", "REPAIR_IN_PROGRESS", "APPEARS_REPAIRED".
   * STRICT SEPARATION OF DUTIES: Citizen repair claims enter PENDING review;
   * citizens cannot directly transition defect status to REPAIR_COMPLETED or CLOSED.
   */
  static async createUpdate(
    issueIdOrNumber: string,
    user: AuthUser,
    input: CreateCommunityUpdateInput,
  ) {
    const issue = await prisma.roadIssue.findFirst({
      where: {
        OR: [{ id: issueIdOrNumber }, { reportNumber: issueIdOrNumber }],
      },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueIdOrNumber}' was not found.`)
    }

    if (issue.status === IssueStatus.REJECTED) {
      throw new BadRequestError("Cannot submit community observations for rejected defect reports.")
    }

    const photosJson = input.photos && input.photos.length > 0 ? JSON.stringify(input.photos) : null

    // Determine verification status
    // For citizen repair claims, it is ALWAYS PENDING review
    const initialVerificationStatus =
      input.updateType === "APPEARS_REPAIRED"
        ? VerificationStatus.PENDING
        : user.role === Role.CITIZEN
          ? VerificationStatus.PENDING
          : VerificationStatus.VERIFIED

    const updateRecord = await prisma.issueCommunityUpdate.create({
      data: {
        issueId: issue.id,
        userId: user.id,
        authorName: user.fullName || "Citizen Reporter",
        updateType: input.updateType as CommunityUpdateType,
        description: input.description,
        photos: photosJson,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        verificationStatus: initialVerificationStatus,
      },
      include: {
        user: {
          select: { id: true, fullName: true, role: true },
        },
      },
    })

    let updatedIssue = issue

    // Side-effects based on update type
    if (input.updateType === "STILL_EXISTS" || input.updateType === "WORSENED") {
      const newConfirmations = issue.confirmationsCount + 1
      const updatedRisk = RiskService.calculateScore({
        damageCategory: issue.damageCategory,
        damageSeverity: issue.damageSeverity,
        depth: issue.depth,
        confirmationsCount: newConfirmations,
      })

      updatedIssue = await prisma.roadIssue.update({
        where: { id: issue.id },
        data: {
          confirmationsCount: newConfirmations,
          riskScore: input.updateType === "WORSENED" ? Math.min(100, updatedRisk + 10) : updatedRisk,
        },
      })

      await prisma.statusHistory.create({
        data: {
          issueId: issue.id,
          previousStatus: issue.status,
          newStatus: issue.status,
          changedById: user.id,
          remarks:
            input.updateType === "WORSENED"
              ? `Citizen reported worsening defect: ${input.description}`
              : `Community confirmation #${newConfirmations}: ${input.description}`,
        },
      })
    } else if (input.updateType === "APPEARS_REPAIRED") {
      // Citizen claim remains PENDING review. Notify municipal staff.
      if (issue.departmentId) {
        const staffUsers = await prisma.user.findMany({
          where: {
            departmentId: issue.departmentId,
            role: { in: [Role.DEPARTMENT_ADMIN, Role.SUPER_ADMIN, Role.FIELD_ADMIN, Role.INSPECTOR] },
          },
          select: { id: true },
        })

        for (const staff of staffUsers) {
          await prisma.notification.create({
            data: {
              userId: staff.id,
              title: `Citizen Repair Claim: Report ${issue.reportNumber}`,
              message: `${user.fullName || "A citizen"} submitted a repair claim with evidence photos. Field audit required.`,
            },
          })
        }
      }
    }

    return {
      update: updateRecord,
      issue: updatedIssue,
    }
  }

  /**
   * Retrieves all community updates for a specific road defect report.
   */
  static async getUpdates(issueIdOrNumber: string) {
    const issue = await prisma.roadIssue.findFirst({
      where: {
        OR: [{ id: issueIdOrNumber }, { reportNumber: issueIdOrNumber }],
      },
      select: { id: true },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueIdOrNumber}' was not found.`)
    }

    const updates = await prisma.issueCommunityUpdate.findMany({
      where: { issueId: issue.id },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, fullName: true, role: true },
        },
        verifiedBy: {
          select: { id: true, fullName: true, role: true },
        },
      },
    })

    return updates
  }

  /**
   * Formally reviews, approves, or rejects a citizen community update / repair claim.
   * Restricted to authorized municipal personnel (FIELD_ADMIN, DEPARTMENT_ADMIN, SUPER_ADMIN).
   */
  static async reviewUpdate(
    issueIdOrNumber: string,
    updateId: string,
    user: AuthUser,
    input: ReviewCommunityUpdateInput,
  ) {
    if (user.role === Role.CITIZEN) {
      throw new ForbiddenError("Citizens cannot verify or approve community evidence claims.")
    }

    const issue = await prisma.roadIssue.findFirst({
      where: {
        OR: [{ id: issueIdOrNumber }, { reportNumber: issueIdOrNumber }],
      },
    })

    if (!issue) {
      throw new NotFoundError(`Road issue '${issueIdOrNumber}' was not found.`)
    }

    const update = await prisma.issueCommunityUpdate.findUnique({
      where: { id: updateId },
    })

    if (!update || update.issueId !== issue.id) {
      throw new NotFoundError(`Community update '${updateId}' was not found for this issue.`)
    }

    const targetVerificationStatus =
      input.decision === "APPROVED"
        ? VerificationStatus.VERIFIED
        : input.decision === "REJECTED"
          ? VerificationStatus.REJECTED
          : VerificationStatus.FLAGGED

    // Update community update record
    const reviewedUpdate = await prisma.issueCommunityUpdate.update({
      where: { id: updateId },
      data: {
        verificationStatus: targetVerificationStatus,
        adminRemarks: input.adminRemarks,
        verifiedById: user.id,
        verifiedAt: new Date(),
      },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
        verifiedBy: { select: { id: true, fullName: true, role: true } },
      },
    })

    let updatedIssue = issue

    // If this was a repair claim ("APPEARS_REPAIRED") and it was APPROVED:
    if (update.updateType === CommunityUpdateType.APPEARS_REPAIRED) {
      if (input.decision === "APPROVED") {
        // Officially transition issue to REPAIR_COMPLETED
        updatedIssue = await prisma.roadIssue.update({
          where: { id: issue.id },
          data: {
            status: IssueStatus.REPAIR_COMPLETED,
          },
        })

        // Create formal ApprovalRecord
        await prisma.approvalRecord.create({
          data: {
            issueId: issue.id,
            actionType: ApprovalActionType.APPROVE_REPAIR,
            previousStatus: issue.status,
            newStatus: IssueStatus.REPAIR_COMPLETED,
            reviewerId: user.id,
            reviewerName: user.fullName || "Municipal Inspector",
            reviewerRole: user.role,
            remarks: `Citizen repair claim verified and approved: ${input.adminRemarks}`,
            evidencePhotos: update.photos,
          },
        })

        // Record StatusHistory
        await prisma.statusHistory.create({
          data: {
            issueId: issue.id,
            previousStatus: issue.status,
            newStatus: IssueStatus.REPAIR_COMPLETED,
            changedById: user.id,
            remarks: `Citizen repair claim approved by ${user.fullName || "Inspector"}: ${input.adminRemarks}`,
          },
        })

        // Notify reporting citizen if known
        if (update.userId) {
          await prisma.notification.create({
            data: {
              userId: update.userId,
              title: `Repair Claim Approved: ${issue.reportNumber}`,
              message: `Your repair observation for report ${issue.reportNumber} has been verified and approved by municipal engineers!`,
            },
          })
        }
      } else if (input.decision === "REJECTED") {
        // Record rejection in ApprovalRecord
        await prisma.approvalRecord.create({
          data: {
            issueId: issue.id,
            actionType: ApprovalActionType.REJECT_REPAIR,
            previousStatus: issue.status,
            newStatus: issue.status,
            reviewerId: user.id,
            reviewerName: user.fullName || "Municipal Inspector",
            reviewerRole: user.role,
            reason: input.adminRemarks,
            remarks: `Citizen repair claim rejected upon inspection: ${input.adminRemarks}`,
          },
        })

        if (update.userId) {
          await prisma.notification.create({
            data: {
              userId: update.userId,
              title: `Repair Claim Notice: ${issue.reportNumber}`,
              message: `Your repair claim was inspected but could not be verified: ${input.adminRemarks}`,
            },
          })
        }
      }
    }

    return {
      update: reviewedUpdate,
      issue: updatedIssue,
    }
  }
}

