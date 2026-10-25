import {
  IssueStatus,
  RepairVerificationRecord,
  RoadIssue,
  StatusHistoryItem,
  UserRole,
} from "../types/roadguard"

/**
 * Valid state transitions mapping: fromStatus -> array of allowed toStatuses.
 */
export const ALLOWED_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  reported: ["under_review", "rejected"],
  under_review: ["assigned", "rejected", "reported"],
  assigned: ["in_progress", "under_review", "rejected"],
  in_progress: ["awaiting_verification", "assigned"],
  awaiting_verification: [
    "verified_repaired",
    "reopened",
    "rejected",
    "in_progress",
  ],
  verified_repaired: ["reopened"],
  reopened: ["under_review", "assigned", "in_progress"],
  rejected: ["under_review"], // Can appeal or re-evaluate
}

/**
 * Role permissions matrix for initiating transitions.
 */
export const ROLE_TRANSITION_PERMISSIONS: Record<UserRole, {
  allowedFrom: IssueStatus[]
  allowedTo: IssueStatus[]
}> = {
  citizen: {
    allowedFrom: ["verified_repaired"],
    allowedTo: ["reopened"],
  },
  authority: {
    allowedFrom: [
      "reported",
      "under_review",
      "assigned",
      "awaiting_verification",
      "reopened",
      "rejected",
    ],
    allowedTo: [
      "under_review",
      "assigned",
      "rejected",
      "verified_repaired",
      "reopened",
    ],
  },
  crew: {
    allowedFrom: ["assigned", "in_progress"],
    allowedTo: ["in_progress", "awaiting_verification"],
  },
  inspector: {
    allowedFrom: ["reported", "under_review", "awaiting_verification"],
    allowedTo: ["under_review", "verified_repaired", "reopened", "rejected"],
  },
}

/**
 * Checks whether a requested status transition is valid according to the state machine and user role.
 */
export function validateStatusTransition(
  currentStatus: IssueStatus,
  targetStatus: IssueStatus,
  role: UserRole,
): { isValid: boolean; error?: string } {
  // Check state machine transitions
  const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] || []
  if (!allowedTargets.includes(targetStatus)) {
    return {
      isValid: false,
      error: `Invalid transition from "${currentStatus}" to "${targetStatus}". Allowed next steps: ${allowedTargets.join(
        ", ",
      )}.`,
    }
  }

  // Check role authorization
  const rolePermissions = ROLE_TRANSITION_PERMISSIONS[role]
  if (!rolePermissions) {
    return { isValid: false, error: `Unknown user role: ${role}` }
  }

  const canActFromCurrent = rolePermissions.allowedFrom.includes(currentStatus)
  const canActToTarget = rolePermissions.allowedTo.includes(targetStatus)

  if (!canActFromCurrent || !canActToTarget) {
    return {
      isValid: false,
      error: `Role "${role}" is not authorized to transition an issue from "${currentStatus}" to "${targetStatus}".`,
    }
  }

  return { isValid: true }
}

/**
 * Executes a verified transition on a RoadIssue, appending to its status history and updating repair records.
 */
export function transitionIssueStatus(
  issue: RoadIssue,
  targetStatus: IssueStatus,
  params: {
    actorRole: UserRole
    actorName: string
    notes: string
    afterPhotoUrl?: string
    assignedCrew?: string
    verificationDecision?: "approved" | "rejected" | "pending"
    reopenReason?: string
    rejectionReason?: string
  },
): { success: boolean; issue?: RoadIssue; error?: string } {
  const validation = validateStatusTransition(
    issue.status,
    targetStatus,
    params.actorRole,
  )

  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  // Specific guard: transitioning to awaiting_verification MUST require evidence
  if (
    targetStatus === "awaiting_verification" &&
    !params.afterPhotoUrl &&
    !issue.repair.afterPhotoUrl
  ) {
    return {
      success: false,
      error:
        "An after-repair photograph is required to submit an issue for verification.",
    }
  }

  const now = new Date().toISOString()
  const historyItem: StatusHistoryItem = {
    id: "HIST-" + Math.floor(10000 + Math.random() * 90000),
    fromStatus: issue.status,
    toStatus: targetStatus,
    timestamp: now,
    actorRole: params.actorRole,
    actorName: params.actorName,
    notes: params.notes || `Status transitioned to ${targetStatus}`,
    evidencePhotoUrl: params.afterPhotoUrl,
  }

  const updatedRepair: RepairVerificationRecord = {
    ...issue.repair,
    ...(params.assignedCrew && {
      assignedCrew: params.assignedCrew,
      assignedAt: now,
    }),
    ...(params.afterPhotoUrl && {
      afterPhotoUrl: params.afterPhotoUrl,
      repairCompletedAt: now,
    }),
    ...(targetStatus === "verified_repaired" && {
      verificationDecision: "approved",
      verifiedBy: `${params.actorName} (${params.actorRole})`,
      verifiedAt: now,
      verificationNotes: params.notes,
      surfaceMatchConfidence: 0.96,
    }),
    ...(targetStatus === "reopened" && {
      verificationDecision: "rejected",
      reopenReason: params.reopenReason || params.notes,
    }),
  }

  const updatedIssue: RoadIssue = {
    ...issue,
    status: targetStatus,
    repair: updatedRepair,
    statusHistory: [...issue.statusHistory, historyItem],
    updatedAt: now,
  }

  return {
    success: true,
    issue: updatedIssue,
  }
}
