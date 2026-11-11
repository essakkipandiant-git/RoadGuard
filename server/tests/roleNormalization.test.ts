import { describe, expect, it, beforeAll } from "vitest"
import { CanonicalRole, normalizeRole, hasMinRole, isStaffRole, isTriageAdmin } from "../src/utils/roleUtils"
import { IssueService } from "../src/services/issueService"
import { prisma } from "../src/config/prisma"
import { Role, IssueStatus, DamageCategory, DamageSeverity } from "@prisma/client"
import { ForbiddenError } from "../src/utils/errors"

describe("Part A: Authoritative Role Normalization & Triage Permission Tests", () => {
  describe("1. Canonical Role Normalizer (normalizeRole)", () => {
    it("normalizes canonical uppercase roles verbatim", () => {
      expect(normalizeRole("SUPER_ADMIN")).toBe(CanonicalRole.SUPER_ADMIN)
      expect(normalizeRole("DEPARTMENT_ADMIN")).toBe(CanonicalRole.DEPARTMENT_ADMIN)
      expect(normalizeRole("FIELD_ADMIN")).toBe(CanonicalRole.FIELD_ADMIN)
      expect(normalizeRole("CITIZEN")).toBe(CanonicalRole.CITIZEN)
    })

    it("normalizes known legacy aliases safely to canonical equivalents", () => {
      // Super Admin aliases
      expect(normalizeRole("super_admin")).toBe(CanonicalRole.SUPER_ADMIN)
      expect(normalizeRole("superadmin")).toBe(CanonicalRole.SUPER_ADMIN)
      expect(normalizeRole("super_administrator")).toBe(CanonicalRole.SUPER_ADMIN)
      expect(normalizeRole("authority")).toBe(CanonicalRole.SUPER_ADMIN)

      // Dept Admin aliases
      expect(normalizeRole("dept_admin")).toBe(CanonicalRole.DEPARTMENT_ADMIN)
      expect(normalizeRole("department_admin")).toBe(CanonicalRole.DEPARTMENT_ADMIN)
      expect(normalizeRole("deptadmin")).toBe(CanonicalRole.DEPARTMENT_ADMIN)

      // Field Admin aliases
      expect(normalizeRole("field_admin")).toBe(CanonicalRole.FIELD_ADMIN)
      expect(normalizeRole("field_inspector")).toBe(CanonicalRole.FIELD_ADMIN)
      expect(normalizeRole("inspector")).toBe(CanonicalRole.FIELD_ADMIN)
      expect(normalizeRole("INSPECTOR")).toBe(CanonicalRole.FIELD_ADMIN)
      expect(normalizeRole("crew")).toBe(CanonicalRole.FIELD_ADMIN)

      // Citizen aliases
      expect(normalizeRole("citizen")).toBe(CanonicalRole.CITIZEN)
      expect(normalizeRole("citizen_reporter")).toBe(CanonicalRole.CITIZEN)
      expect(normalizeRole("public")).toBe(CanonicalRole.CITIZEN)
    })

    it("safely rejects unknown or arbitrary roles without promoting them", () => {
      expect(normalizeRole("hacker")).toBeNull()
      expect(normalizeRole("manager")).toBeNull()
      expect(normalizeRole("guest")).toBeNull()
      expect(normalizeRole("root")).toBeNull()
      expect(normalizeRole("")).toBeNull()
      expect(normalizeRole(null)).toBeNull()
      expect(normalizeRole(undefined)).toBeNull()
      expect(normalizeRole(12345)).toBeNull()
    })

    it("evaluates hierarchy ranks and staff privileges accurately", () => {
      expect(hasMinRole("super_admin", CanonicalRole.SUPER_ADMIN)).toBe(true)
      expect(hasMinRole("dept_admin", CanonicalRole.DEPARTMENT_ADMIN)).toBe(true)
      expect(hasMinRole("dept_admin", CanonicalRole.SUPER_ADMIN)).toBe(false)
      expect(hasMinRole("citizen", CanonicalRole.FIELD_ADMIN)).toBe(false)

      expect(isStaffRole("field_inspector")).toBe(true)
      expect(isStaffRole("department_admin")).toBe(true)
      expect(isStaffRole("super_admin")).toBe(true)
      expect(isStaffRole("citizen")).toBe(false)
      expect(isStaffRole("unknown_role")).toBe(false)

      expect(isTriageAdmin("super_admin")).toBe(true)
      expect(isTriageAdmin("dept_admin")).toBe(true)
      expect(isTriageAdmin("field_inspector")).toBe(false)
      expect(isTriageAdmin("citizen")).toBe(false)
    })
  })

  describe("2. Triage Permissions & Role Boundary Enforcement (executeAction)", () => {
    let testIssue: any
    let citizenUser: any
    let fieldUser: any
    let deptUser: any
    let superUser: any

    beforeAll(async () => {
      // Find or seed active municipal ward and department
      const ward = await prisma.ward.findFirst()
      const dept = await prisma.department.findFirst()

      // Fetch or create users for each role
      citizenUser = await prisma.user.findFirst({ where: { role: Role.CITIZEN } })
      if (!citizenUser) {
        citizenUser = await prisma.user.create({
          data: {
            email: "citizen_test@roadguard.in",
            fullName: "Citizen Test",
            passwordHash: "hash123",
            role: Role.CITIZEN,
          },
        })
      }

      fieldUser = await prisma.user.findFirst({
        where: { OR: [{ role: Role.FIELD_ADMIN }, { role: Role.INSPECTOR }] },
      })
      if (!fieldUser) {
        fieldUser = await prisma.user.create({
          data: {
            email: "field_test@roadguard.in",
            fullName: "Inspector Field",
            passwordHash: "hash123",
            role: Role.FIELD_ADMIN,
          },
        })
      }

      deptUser = await prisma.user.findFirst({ where: { role: Role.DEPARTMENT_ADMIN } })
      if (!deptUser) {
        deptUser = await prisma.user.create({
          data: {
            email: "dept_test@roadguard.in",
            fullName: "Dept Admin Test",
            passwordHash: "hash123",
            role: Role.DEPARTMENT_ADMIN,
            departmentId: dept?.id,
          },
        })
      }

      superUser = await prisma.user.findFirst({ where: { role: Role.SUPER_ADMIN } })
      if (!superUser) {
        superUser = await prisma.user.create({
          data: {
            email: "super_test@roadguard.in",
            fullName: "Super Admin Test",
            passwordHash: "hash123",
            role: Role.SUPER_ADMIN,
          },
        })
      }

      // Create a test issue in REPORTED status
      testIssue = await prisma.roadIssue.create({
        data: {
          reportNumber: `ROLE-TEST-${Date.now()}`,
          title: "Role Permission Test Pothole",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.HIGH,
          latitude: 19.076,
          longitude: 72.8777,
          address: "Bandra Kurla Complex, Mumbai",
          wardId: ward?.id,
          departmentId: dept?.id,
          reportedById: citizenUser.id,
          status: IssueStatus.REPORTED,
          riskScore: 75,
        },
      })
    })

    it("SUPER_ADMIN can successfully execute 'Verify AI & Triage' (VERIFY_REPORT)", async () => {
      const res = await IssueService.executeAction(testIssue.id, superUser, {
        actionType: "VERIFY_REPORT",
        remarks: "Super Admin verified AI detection.",
      })

      expect(res.issue.status).toBe(IssueStatus.VERIFIED)
      expect(res.approvalRecord.actionType).toBe("VERIFY_REPORT")
    })

    it("DEPARTMENT_ADMIN can successfully execute 'Verify AI & Triage' (VERIFY_REPORT)", async () => {
      // Transition back to reported for dept test
      await prisma.roadIssue.update({
        where: { id: testIssue.id },
        data: { status: IssueStatus.REPORTED },
      })

      const res = await IssueService.executeAction(testIssue.id, deptUser, {
        actionType: "VERIFY_REPORT",
        remarks: "Dept Admin verified AI detection.",
      })

      expect(res.issue.status).toBe(IssueStatus.VERIFIED)
      expect(res.approvalRecord.actionType).toBe("VERIFY_REPORT")
    })

    it("CITIZEN is strictly forbidden from approving administrative triage (VERIFY_REPORT)", async () => {
      await expect(
        IssueService.executeAction(testIssue.id, citizenUser, {
          actionType: "VERIFY_REPORT",
          remarks: "Citizen trying to approve own triage.",
        }),
      ).rejects.toThrow(ForbiddenError)
    })

    it("FIELD_ADMIN cannot perform Super Admin actions like assigning departments", async () => {
      await expect(
        IssueService.executeAction(testIssue.id, fieldUser, {
          actionType: "ASSIGN_DEPARTMENT",
          departmentId: "some-department-uuid",
        }),
      ).rejects.toThrow(ForbiddenError)
    })

    it("FIELD_ADMIN cannot dispatch department work orders", async () => {
      await expect(
        IssueService.executeAction(testIssue.id, fieldUser, {
          actionType: "DISPATCH_WORK_ORDER",
          workDescription: "Hot mix asphalt repair",
        }),
      ).rejects.toThrow(ForbiddenError)
    })

    it("unknown or forged roles are strictly rejected with ForbiddenError", async () => {
      const forgedUser = {
        ...citizenUser,
        role: "arbitrary_attacker_role" as any,
      }

      await expect(
        IssueService.executeAction(testIssue.id, forgedUser, {
          actionType: "VERIFY_REPORT",
        }),
      ).rejects.toThrow(ForbiddenError)
    })

    it("normalizes legacy aliases during action authorization (e.g. super_admin string)", async () => {
      const legacySuperUser = {
        ...superUser,
        role: "super_admin" as any, // legacy lowercase alias
      }

      const res = await IssueService.executeAction(testIssue.id, legacySuperUser, {
        actionType: "VERIFY_REPORT",
        remarks: "Verified via normalized super_admin alias",
      })

      expect(res.issue.status).toBe(IssueStatus.VERIFIED)
    })
  })
})

