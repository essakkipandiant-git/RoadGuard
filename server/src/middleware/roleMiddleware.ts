import { Request, Response, NextFunction } from "express"
import { Role, IssueStatus } from "@prisma/client"
import { ForbiddenError, UnauthorizedError, BadRequestError } from "../utils/errors"
import { authenticate } from "./authMiddleware"
import { prisma } from "../config/prisma"
import { CanonicalRole, normalizeRole } from "../utils/roleUtils"

/**
 * Role numeric hierarchy for rank comparison:
 * CITIZEN (1) < FIELD_ADMIN / INSPECTOR (2) < DEPARTMENT_ADMIN (3) < SUPER_ADMIN (4)
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  [CanonicalRole.CITIZEN]: 1,
  [CanonicalRole.FIELD_ADMIN]: 2,
  [Role.INSPECTOR]: 2, // Legacy alias mapped to FIELD_ADMIN
  [CanonicalRole.DEPARTMENT_ADMIN]: 3,
  [CanonicalRole.SUPER_ADMIN]: 4,
}

/**
 * Helper to check if a user possesses one of the allowed roles.
 */
export function hasRole(userRole: unknown, ...allowedRoles: (Role | CanonicalRole | string)[]): boolean {
  const normUser = normalizeRole(userRole)
  if (!normUser) return false
  const allowed = allowedRoles.map((r) => normalizeRole(r)).filter(Boolean)
  return allowed.includes(normUser)
}

/**
 * Helper to check if a user role meets or exceeds a minimum hierarchical rank.
 */
export function hasMinRole(userRole: unknown, minRole: Role | CanonicalRole | string): boolean {
  const normUser = normalizeRole(userRole)
  const normMin = normalizeRole(minRole)
  if (!normUser || !normMin) return false
  return ROLE_HIERARCHY[normUser] >= ROLE_HIERARCHY[normMin]
}

/**
 * Helper to check if a user has municipal staff privileges (Inspector/Field Admin or above).
 */
export function isStaffRole(role: unknown): boolean {
  const norm = normalizeRole(role)
  if (!norm) return false
  return norm === CanonicalRole.FIELD_ADMIN || norm === CanonicalRole.DEPARTMENT_ADMIN || norm === CanonicalRole.SUPER_ADMIN
}

/**
 * Helper to check if a user has administrative privileges (Department Admin or Super Admin).
 */
export function isAdminRole(role: unknown): boolean {
  const norm = normalizeRole(role)
  if (!norm) return false
  return norm === CanonicalRole.DEPARTMENT_ADMIN || norm === CanonicalRole.SUPER_ADMIN
}

/**
 * Permitted status state transitions across road defect lifecycle.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  [IssueStatus.REPORTED]: [IssueStatus.UNDER_REVIEW, IssueStatus.VERIFIED, IssueStatus.REJECTED],
  [IssueStatus.UNDER_REVIEW]: [IssueStatus.VERIFIED, IssueStatus.REJECTED],
  [IssueStatus.VERIFIED]: [IssueStatus.ASSIGNED, IssueStatus.REJECTED],
  [IssueStatus.ASSIGNED]: [IssueStatus.IN_PROGRESS, IssueStatus.REJECTED],
  [IssueStatus.IN_PROGRESS]: [IssueStatus.REPAIR_COMPLETED],
  [IssueStatus.REPAIR_COMPLETED]: [IssueStatus.CLOSED, IssueStatus.UNDER_REVIEW], // Reopened
  [IssueStatus.CLOSED]: [IssueStatus.UNDER_REVIEW], // Reopened
  [IssueStatus.REJECTED]: [IssueStatus.UNDER_REVIEW], // Re-evaluated
}

/**
 * Validates whether a specific role is authorized to transition an issue from currentStatus to targetStatus.
 */
export function isStatusTransitionAllowed(
  role: unknown,
  currentStatus: IssueStatus,
  targetStatus: IssueStatus,
): boolean {
  const normRole = normalizeRole(role)
  if (!normRole) return false

  const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || []
  if (!allowedNext.includes(targetStatus)) {
    return false
  }

  // SUPER_ADMIN has master override for any valid lifecycle transition
  if (normRole === CanonicalRole.SUPER_ADMIN) {
    return true
  }

  switch (targetStatus) {
    case IssueStatus.UNDER_REVIEW:
      // Inspectors & Dept Admins can start triage; Citizens can request reopen on completed/closed/rejected
      if (normRole === CanonicalRole.CITIZEN) {
        return (
          currentStatus === IssueStatus.REPAIR_COMPLETED ||
          currentStatus === IssueStatus.CLOSED ||
          currentStatus === IssueStatus.REJECTED
        )
      }
      return normRole === CanonicalRole.FIELD_ADMIN || normRole === CanonicalRole.DEPARTMENT_ADMIN

    case IssueStatus.VERIFIED:
    case IssueStatus.REJECTED:
      // Only trained field admins, inspectors or department admins can verify defects or reject false reports
      return normRole === CanonicalRole.FIELD_ADMIN || normRole === CanonicalRole.DEPARTMENT_ADMIN

    case IssueStatus.ASSIGNED:
      // Only Department Admins can assign work orders & contractors
      return normRole === CanonicalRole.DEPARTMENT_ADMIN

    case IssueStatus.IN_PROGRESS:
    case IssueStatus.REPAIR_COMPLETED:
    case IssueStatus.CLOSED:
      // Field admins, Inspectors and Department Admins can progress and close repairs
      return normRole === CanonicalRole.DEPARTMENT_ADMIN || normRole === CanonicalRole.FIELD_ADMIN

    default:
      return false
  }
}

/**
 * Ensures user is authenticated and has one of the required roles.
 * Returns 401 if unauthenticated, 403 if role is forbidden.
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // If authenticate hasn't populated req.user yet, run authenticate
    if (!req.user) {
      await authenticate(req, res, (err) => {
        if (err) return next(err)
        if (!req.user) {
          return next(new UnauthorizedError("Authentication required. Please log in."))
        }
        verifyRole(req, next)
      })
    } else {
      verifyRole(req, next)
    }

    function verifyRole(request: Request, nxt: NextFunction) {
      if (!request.user) {
        return nxt(new UnauthorizedError("Authentication required. Please log in."))
      }

      const normUser = normalizeRole(request.user.role)
      const allowedNorm = allowedRoles.map((r) => normalizeRole(r) || r)

      if (!normUser || !allowedNorm.includes(normUser as any)) {
        return nxt(
          new ForbiddenError(
            `Access denied. Role '${request.user.role}' is not authorized to perform this action.`,
          ),
        )
      }

      nxt()
    }
  }
}

/**
 * Ensures user is authenticated and has at least the minimum required hierarchical role rank.
 */
export function requireMinRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      await authenticate(req, res, (err) => {
        if (err) return next(err)
        if (!req.user) {
          return next(new UnauthorizedError("Authentication required. Please log in."))
        }
        verifyRank(req, next)
      })
    } else {
      verifyRank(req, next)
    }

    function verifyRank(request: Request, nxt: NextFunction) {
      if (!request.user) {
        return nxt(new UnauthorizedError("Authentication required. Please log in."))
      }

      if (!hasMinRole(request.user.role, minRole)) {
        return nxt(
          new ForbiddenError(
            `Access denied. Requires at least '${minRole}' role rank.`,
          ),
        )
      }

      nxt()
    }
  }
}

/**
 * Shorthand middleware: Requires staff privileges (FIELD_ADMIN, INSPECTOR, DEPARTMENT_ADMIN, SUPER_ADMIN).
 */
export const requireStaff = requireRole(Role.FIELD_ADMIN, Role.INSPECTOR, Role.DEPARTMENT_ADMIN, Role.SUPER_ADMIN)

/**
 * Shorthand middleware: Requires administrative privileges (DEPARTMENT_ADMIN, SUPER_ADMIN).
 */
export const requireAdmin = requireRole(Role.DEPARTMENT_ADMIN, Role.SUPER_ADMIN)

/**
 * Shorthand middleware: Requires super administrator privileges.
 */
export const requireSuperAdmin = requireRole(Role.SUPER_ADMIN)

/**
 * Shorthand middleware: Requires citizen role.
 */
export const requireCitizen = requireRole(Role.CITIZEN)

export type ParamExtractor = (
  req: Request,
) => string | string[] | undefined | null | Promise<string | string[] | undefined | null>

export function normalizeParam(val: unknown): string | undefined {
  if (typeof val === "string") return val.trim()
  if (Array.isArray(val) && typeof val[0] === "string") return val[0].trim()
  return undefined
}

/**
 * Enforces departmental authorization boundaries.
 * - SUPER_ADMIN has global municipal access.
 * - DEPARTMENT_ADMIN or INSPECTOR can only manage resources within their assigned department.
 * - CITIZEN cannot manage department-scoped operations.
 */
export function requireDepartmentAccess(
  getDepartmentId: ParamExtractor = (req) => req.params.departmentId || req.body?.departmentId,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      await authenticate(req, res, (err) => {
        if (err) return next(err)
        if (!req.user) {
          return next(new UnauthorizedError("Authentication required. Please log in."))
        }
        checkDepartment(req, next)
      })
    } else {
      checkDepartment(req, next)
    }

    async function checkDepartment(request: Request, nxt: NextFunction) {
      if (!request.user) {
        return nxt(new UnauthorizedError("Authentication required. Please log in."))
      }

      // Super Admins have unrestricted jurisdiction across all departments
      if (request.user.role === Role.SUPER_ADMIN) {
        return nxt()
      }

      // Citizens cannot access department-managed operations
      if (request.user.role === Role.CITIZEN) {
        return nxt(new ForbiddenError("Access denied: Citizens cannot access departmental operations."))
      }

      const rawDeptId = await getDepartmentId(request)
      const targetDeptId = normalizeParam(rawDeptId)
      if (!targetDeptId) {
        return nxt(new BadRequestError("Department identifier is required for this operation."))
      }

      // If user has an assigned department, verify boundary
      if (request.user.departmentId && request.user.departmentId !== targetDeptId) {
        return nxt(
          new ForbiddenError(
            "Access denied: You are not authorized to access or manage resources belonging to another municipal department.",
          ),
        )
      }

      nxt()
    }
  }
}

/**
 * Enforces ward authorization boundaries.
 * - SUPER_ADMIN has global ward access.
 * - Staff (DEPARTMENT_ADMIN, INSPECTOR) can only manage wards belonging to their department.
 */
export function requireWardAccess(
  getWardId: ParamExtractor = (req) => req.params.wardId || req.body?.wardId,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      await authenticate(req, res, (err) => {
        if (err) return next(err)
        if (!req.user) {
          return next(new UnauthorizedError("Authentication required. Please log in."))
        }
        checkWard(req, next)
      })
    } else {
      checkWard(req, next)
    }

    async function checkWard(request: Request, nxt: NextFunction) {
      if (!request.user) {
        return nxt(new UnauthorizedError("Authentication required. Please log in."))
      }

      if (request.user.role === Role.SUPER_ADMIN) {
        return nxt()
      }

      const rawWardId = await getWardId(request)
      const targetWardId = normalizeParam(rawWardId)
      if (!targetWardId) {
        return nxt(new BadRequestError("Ward identifier is required for this operation."))
      }

      // Fetch ward from database to inspect governing department
      const ward = await prisma.ward.findUnique({
        where: { id: targetWardId },
        select: { id: true, departmentId: true },
      })

      if (!ward) {
        return nxt(new BadRequestError(`Ward '${targetWardId}' was not found.`))
      }

      // If staff member has assigned department, ward must match their department
      if (
        request.user.departmentId &&
        ward.departmentId &&
        request.user.departmentId !== ward.departmentId
      ) {
        return nxt(
          new ForbiddenError(
            "Access denied: This ward is under the jurisdiction of a different department.",
          ),
        )
      }

      nxt()
    }
  }
}

/**
 * Enforces that a resource (e.g. road issue report) is either:
 * 1. Owned by the requesting user (CITIZEN checking their own report).
 * 2. Or accessed by authorized municipal staff (INSPECTOR, DEPARTMENT_ADMIN, SUPER_ADMIN).
 */
export function requireOwnershipOrStaff(
  getOwnerId: ParamExtractor,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      await authenticate(req, res, (err) => {
        if (err) return next(err)
        if (!req.user) {
          return next(new UnauthorizedError("Authentication required. Please log in."))
        }
        checkOwnership(req, next)
      })
    } else {
      checkOwnership(req, next)
    }

    async function checkOwnership(request: Request, nxt: NextFunction) {
      if (!request.user) {
        return nxt(new UnauthorizedError("Authentication required. Please log in."))
      }

      // Staff roles can access issues across municipal review workflows
      if (isStaffRole(request.user.role)) {
        return nxt()
      }

      const rawOwnerId = await getOwnerId(request)
      const ownerId = normalizeParam(rawOwnerId)
      if (ownerId && ownerId !== request.user.id) {
        return nxt(new ForbiddenError("Access denied: You are not authorized to access or modify another citizen's report."))
      }

      nxt()
    }
  }
}
