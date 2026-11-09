import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { AuthService } from "../src/services/authService"
import { Role, IssueStatus } from "@prisma/client"
import bcrypt from "bcryptjs"

describe("Phase 4: Backend Role-Based Access Control (RBAC) & Boundary Tests", () => {
  let superAdminToken: string
  let deptAdminToken: string
  let inspectorToken: string
  let citizenToken: string
  let otherCitizenToken: string

  let citizenUserId: string
  let otherCitizenUserId: string

  let highwaysDeptId: string
  let publicWorksDeptId: string
  let highwaysWardId: string
  let publicWorksWardId: string

  beforeAll(async () => {
    // 1. Fetch seeded departments
    const highways = await prisma.department.findFirst({
      where: { name: { contains: "Highways" } },
    })
    const publicWorks = await prisma.department.findFirst({
      where: { name: { contains: "Public Works" } },
    })
    highwaysDeptId = highways!.id
    publicWorksDeptId = publicWorks!.id

    // 2. Fetch seeded wards
    const ward1 = await prisma.ward.findFirst({
      where: { wardCode: "WARD-01" },
    })
    const ward2 = await prisma.ward.findFirst({
      where: { wardCode: "WARD-02" },
    })
    highwaysWardId = ward1!.id
    publicWorksWardId = ward2!.id

    // 3. Log in seeded users to obtain valid tokens
    const adminRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@roadguard.local", password: "Password123!" })
    superAdminToken = adminRes.body.data.token

    const deptChiefRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "highways.chief@roadguard.local", password: "Password123!" })
    deptAdminToken = deptChiefRes.body.data.token

    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token

    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
    citizenUserId = citizenRes.body.data.user.id

    // 4. Create an additional citizen to test resource ownership boundaries
    const pwHash = await bcrypt.hash("Password123!", 10)
    const otherCitizen = await prisma.user.upsert({
      where: { email: "other.citizen@roadguard.local" },
      update: {},
      create: {
        email: "other.citizen@roadguard.local",
        passwordHash: pwHash,
        fullName: "Another Citizen",
        role: Role.CITIZEN,
        isActive: true,
      },
    })
    otherCitizenUserId = otherCitizen.id
    otherCitizenToken = AuthService.generateToken({
      userId: otherCitizen.id,
      email: otherCitizen.email,
      role: Role.CITIZEN,
    })
  })

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: { email: "other.citizen@roadguard.local" },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Unauthenticated Access Protection", () => {
    it("Rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/rbac/citizen-only")
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("Rejects invalid / malformed JWT with 401 Unauthorized", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/super-admin-only")
        .set("Authorization", "Bearer invalid-signature-token-999")

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })
  })

  describe("2. Citizen Privilege Isolation", () => {
    it("Allows citizen to access citizen-scoped endpoints", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/citizen-only")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("Citizen access granted")
    })

    it("Denies citizen access to Inspector-only endpoints with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/inspector-only")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("Role 'CITIZEN' is not authorized")
    })

    it("Denies citizen access to Admin endpoints with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/admin-only")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Denies citizen access to Super Admin endpoints with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/super-admin-only")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Denies citizen access to minimum hierarchical staff ranking (requireMinRole)", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/min-inspector")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toContain("Requires at least 'INSPECTOR' role rank")
    })
  })

  describe("3. Inspector Role Boundaries", () => {
    it("Allows Inspector to access inspector-authorized endpoints", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/inspector-only")
        .set("Authorization", `Bearer ${inspectorToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("Inspector access granted")
    })

    it("Allows Inspector to access min-inspector hierarchical endpoint", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/min-inspector")
        .set("Authorization", `Bearer ${inspectorToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Denies Inspector access to Admin-only endpoints with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/admin-only")
        .set("Authorization", `Bearer ${inspectorToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("Role 'INSPECTOR' is not authorized")
    })

    it("Denies Inspector access to Super Admin endpoints with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/super-admin-only")
        .set("Authorization", `Bearer ${inspectorToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    })
  })

  describe("4. Department Admin Role & Hierarchical Access", () => {
    it("Allows Department Admin to access admin-only endpoints", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/admin-only")
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("Admin access granted")
    })

    it("Allows Department Admin to access min-inspector endpoint due to higher rank (3 >= 2)", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/min-inspector")
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Denies Department Admin access to Super Admin-exclusive endpoints with 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/super-admin-only")
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("5. Super Admin Master Access", () => {
    it("Allows Super Admin to access super-admin-only endpoint", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/super-admin-only")
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Allows Super Admin to access admin-only endpoint", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/admin-only")
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Allows Super Admin to access inspector-only endpoint", async () => {
      const res = await request(app)
        .get("/api/v1/rbac/inspector-only")
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe("6. Strict Departmental Boundary Enforcement (requireDepartmentAccess)", () => {
    it("Allows Highways Department Chief to access Highways Department resources", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/department/${highwaysDeptId}`)
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("Department access granted")
    })

    it("Blocks Highways Department Chief from managing Public Works resources (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/department/${publicWorksDeptId}`)
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("another municipal department")
    })

    it("Blocks Citizens from accessing department-managed operations (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/department/${highwaysDeptId}`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toContain("Citizens cannot access departmental operations")
    })

    it("Allows Super Admin unrestricted cross-department access", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/department/${publicWorksDeptId}`)
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("Department access granted")
    })
  })

  describe("7. Municipal Ward Boundary Enforcement (requireWardAccess)", () => {
    it("Allows Highways staff to manage Ward 1 (governed by Highways Dept)", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/ward/${highwaysWardId}`)
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.wardId).toBe(highwaysWardId)
    })

    it("Blocks Highways staff from managing Ward 2 (governed by Public Works)", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/ward/${publicWorksWardId}`)
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("jurisdiction of a different department")
    })

    it("Allows Super Admin global access to any municipal ward", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/ward/${publicWorksWardId}`)
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe("8. Resource Ownership & Citizen Scope (requireOwnershipOrStaff)", () => {
    it("Allows a citizen to access their own report", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/report-owner/${citizenUserId}`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.ownerId).toBe(citizenUserId)
    })

    it("Blocks a citizen from accessing another citizen's private report (403 Forbidden)", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/report-owner/${otherCitizenUserId}`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("another citizen's report")
    })

    it("Allows Inspector to access any citizen's report for municipal inspection", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/report-owner/${citizenUserId}`)
        .set("Authorization", `Bearer ${inspectorToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Allows Super Admin to access any citizen's report", async () => {
      const res = await request(app)
        .get(`/api/v1/rbac/report-owner/${citizenUserId}`)
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })

  describe("9. State Machine Status Transition Authorization (isStatusTransitionAllowed)", () => {
    it("Allows Inspector to transition REPORTED -> UNDER_REVIEW", async () => {
      const res = await request(app)
        .post("/api/v1/rbac/status-transition")
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          currentStatus: IssueStatus.REPORTED,
          targetStatus: IssueStatus.UNDER_REVIEW,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Allows Inspector to transition UNDER_REVIEW -> VERIFIED", async () => {
      const res = await request(app)
        .post("/api/v1/rbac/status-transition")
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          currentStatus: IssueStatus.UNDER_REVIEW,
          targetStatus: IssueStatus.VERIFIED,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Blocks Inspector from transitioning VERIFIED -> ASSIGNED (Dept Admin only)", async () => {
      const res = await request(app)
        .post("/api/v1/rbac/status-transition")
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          currentStatus: IssueStatus.VERIFIED,
          targetStatus: IssueStatus.ASSIGNED,
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Allows Department Admin to transition VERIFIED -> ASSIGNED", async () => {
      const res = await request(app)
        .post("/api/v1/rbac/status-transition")
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          currentStatus: IssueStatus.VERIFIED,
          targetStatus: IssueStatus.ASSIGNED,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it("Rejects illegal status transition that skips lifecycle steps (e.g. REPORTED -> CLOSED)", async () => {
      const res = await request(app)
        .post("/api/v1/rbac/status-transition")
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          currentStatus: IssueStatus.REPORTED,
          targetStatus: IssueStatus.CLOSED,
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Allows Super Admin to perform any valid lifecycle transition", async () => {
      const res = await request(app)
        .post("/api/v1/rbac/status-transition")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({
          currentStatus: IssueStatus.ASSIGNED,
          targetStatus: IssueStatus.IN_PROGRESS,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })
  })
})

