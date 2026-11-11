/**
 * RoadGuard AI — Canonical Role System & Authorization Normalizer
 * Establishes a single authoritative role hierarchy across the entire application.
 */

export enum CanonicalRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  DEPARTMENT_ADMIN = "DEPARTMENT_ADMIN",
  FIELD_ADMIN = "FIELD_ADMIN",
  CITIZEN = "CITIZEN",
}

/**
 * Numeric rank hierarchy for privilege comparison.
 */
export const CANONICAL_ROLE_HIERARCHY: Record<CanonicalRole, number> = {
  [CanonicalRole.CITIZEN]: 1,
  [CanonicalRole.FIELD_ADMIN]: 2,
  [CanonicalRole.DEPARTMENT_ADMIN]: 3,
  [CanonicalRole.SUPER_ADMIN]: 4,
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
      return CanonicalRole.SUPER_ADMIN

    case "dept_admin":
    case "department_admin":
    case "deptadmin":
    case "departmentadmin":
      return CanonicalRole.DEPARTMENT_ADMIN

    case "field_admin":
    case "fieldadmin":
    case "field_inspector":
    case "fieldinspector":
    case "inspector":
    case "crew":
      return CanonicalRole.FIELD_ADMIN

    case "citizen":
    case "citizen_reporter":
    case "public":
      return CanonicalRole.CITIZEN

    default:
      // Check if it already matches canonical in uppercase
      if (input === CanonicalRole.SUPER_ADMIN) return CanonicalRole.SUPER_ADMIN
      if (input === CanonicalRole.DEPARTMENT_ADMIN) return CanonicalRole.DEPARTMENT_ADMIN
      if (input === CanonicalRole.FIELD_ADMIN) return CanonicalRole.FIELD_ADMIN
      if (input === CanonicalRole.CITIZEN) return CanonicalRole.CITIZEN
      if (input === "INSPECTOR") return CanonicalRole.FIELD_ADMIN

      // Arbitrary or unknown roles must NEVER be converted to privileged roles
      return null
  }
}

/**
 * Checks whether a role has at least the minimum required rank.
 */
export function hasMinRole(userRole: unknown, minRole: CanonicalRole): boolean {
  const norm = normalizeRole(userRole)
  if (!norm) return false
  return CANONICAL_ROLE_HIERARCHY[norm] >= CANONICAL_ROLE_HIERARCHY[minRole]
}

/**
 * Returns true if the role is a staff role (Field Admin, Dept Admin, or Super Admin).
 */
export function isStaffRole(userRole: unknown): boolean {
  const norm = normalizeRole(userRole)
  if (!norm) return false
  return (
    norm === CanonicalRole.FIELD_ADMIN ||
    norm === CanonicalRole.DEPARTMENT_ADMIN ||
    norm === CanonicalRole.SUPER_ADMIN
  )
}

/**
 * Returns true if the role has administrative triage authority (Super Admin or Dept Admin).
 */
export function isTriageAdmin(userRole: unknown): boolean {
  const norm = normalizeRole(userRole)
  if (!norm) return false
  return norm === CanonicalRole.SUPER_ADMIN || norm === CanonicalRole.DEPARTMENT_ADMIN
}
