import { describe, expect, it } from "vitest"
import { normalizeRole, isStaffRole, isTriageAdmin } from "../utils/roleUtils"
import { validateStatusTransition } from "../services/repairWorkflowService"

describe("Frontend Role Normalization & State Machine Tests", () => {
  it("normalizes super_admin and legacy aliases correctly", () => {
    expect(normalizeRole("super_admin")).toBe("SUPER_ADMIN")
    expect(normalizeRole("dept_admin")).toBe("DEPARTMENT_ADMIN")
    expect(normalizeRole("field_inspector")).toBe("FIELD_ADMIN")
    expect(normalizeRole("citizen_reporter")).toBe("CITIZEN")
  })

  it("safely rejects unknown or arbitrary roles without privilege promotion", () => {
    expect(normalizeRole("hacker")).toBeNull()
    expect(normalizeRole("manager")).toBeNull()
    expect(normalizeRole("unknown_role")).toBeNull()
    expect(normalizeRole("")).toBeNull()
    expect(normalizeRole(null)).toBeNull()
  })

  it("identifies staff roles and triage admins correctly", () => {
    expect(isStaffRole("super_admin")).toBe(true)
    expect(isStaffRole("dept_admin")).toBe(true)
    expect(isStaffRole("field_inspector")).toBe(true)
    expect(isStaffRole("citizen")).toBe(false)

    expect(isTriageAdmin("super_admin")).toBe(true)
    expect(isTriageAdmin("dept_admin")).toBe(true)
    expect(isTriageAdmin("field_inspector")).toBe(false)
    expect(isTriageAdmin("citizen")).toBe(false)
  })

  it("allows SUPER_ADMIN to triage from reported to under_review without throwing Unknown user role", () => {
    // Both canonical and lowercase alias should now succeed cleanly!
    const res1 = validateStatusTransition("reported", "under_review", "SUPER_ADMIN")
    expect(res1.isValid).toBe(true)

    const res2 = validateStatusTransition("reported", "under_review", "super_admin")
    expect(res2.isValid).toBe(true)
  })

  it("allows DEPARTMENT_ADMIN to triage from reported to under_review", () => {
    const res1 = validateStatusTransition("reported", "under_review", "DEPARTMENT_ADMIN")
    expect(res1.isValid).toBe(true)

    const res2 = validateStatusTransition("reported", "under_review", "dept_admin")
    expect(res2.isValid).toBe(true)
  })

  it("blocks CITIZEN from triaging from reported to under_review", () => {
    const res1 = validateStatusTransition("reported", "under_review", "CITIZEN")
    expect(res1.isValid).toBe(false)

    const res2 = validateStatusTransition("reported", "under_review", "citizen")
    expect(res2.isValid).toBe(false)
  })

  it("rejects unknown user role with clear error message", () => {
    const res = validateStatusTransition("reported", "under_review", "arbitrary_role" as any)
    expect(res.isValid).toBe(false)
    expect(res.error).toBe("Unknown user role: arbitrary_role")
  })
})

