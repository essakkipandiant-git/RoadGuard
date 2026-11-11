/**
 * RoadGuard AI — Canonical Role System & Authorization Normalizer (Frontend)
 * Source of truth for client-side role validation and display.
 */

export type CanonicalRole = "SUPER_ADMIN" | "DEPARTMENT_ADMIN" | "FIELD_ADMIN" | "CITIZEN"

export const CANONICAL_ROLE_HIERARCHY: Record<CanonicalRole, number> = {
  CITIZEN: 1,
  FIELD_ADMIN: 2,
  DEPARTMENT_ADMIN: 3,
  SUPER_ADMIN: 4,
}

/**
 * Normalizes any role input (legacy aliases, mixed casing, frontend strings)
 * into one of the 4 canonical roles.
 *
 * Rules:
 * - Known aliases safely map to their canonical equivalent.
 * - Unknown or arbitrary strings return null (NEVER promoted to privileged roles).
 */
export function normalizeRole(input: unknown): CanonicalRole | null {
  if (!input || typeof input !== "string") {
    return null
  }

  const clean = input.trim().toLowerCase().replace(/[-\s]+/g, "_")

  switch (clean) {
    case "super_admin":
    case "superadmin":
    case "super_administrator":
    case "authority":
      return "SUPER_ADMIN"

    case "dept_admin":
    case "department_admin":
    case "deptadmin":
    case "departmentadmin":
      return "DEPARTMENT_ADMIN"

    case "field_admin":
    case "fieldadmin":
    case "field_inspector":
    case "fieldinspector":
    case "inspector":
    case "crew":
      return "FIELD_ADMIN"

    case "citizen":
    case "citizen_reporter":
    case "public":
      return "CITIZEN"

    default:
      if (input === "SUPER_ADMIN") return "SUPER_ADMIN"
      if (input === "DEPARTMENT_ADMIN") return "DEPARTMENT_ADMIN"
      if (input === "FIELD_ADMIN") return "FIELD_ADMIN"
      if (input === "CITIZEN") return "CITIZEN"
      if (input === "INSPECTOR") return "FIELD_ADMIN"

      return null
  }
}

export function isStaffRole(userRole: unknown): boolean {
  const norm = normalizeRole(userRole)
  if (!norm) return false
  return norm === "FIELD_ADMIN" || norm === "DEPARTMENT_ADMIN" || norm === "SUPER_ADMIN"
}

export function isTriageAdmin(userRole: unknown): boolean {
  const norm = normalizeRole(userRole)
  if (!norm) return false
  return norm === "SUPER_ADMIN" || norm === "DEPARTMENT_ADMIN"
}

