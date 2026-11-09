import { beforeAll, afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { AuditService } from "../src/services/auditService"

describe("Phase 11: Security Hardening & Audit Logging Tests", () => {
  let superAdminToken: string
  let citizenToken: string
  let inspectorToken: string
  let sampleIssueId: string

  beforeAll(async () => {
    // 1. Authenticate as Super Admin
    const adminRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@roadguard.local", password: "Password123!" })
    superAdminToken = adminRes.body.data.token

    // 2. Authenticate as Citizen
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token

    // 3. Authenticate as Inspector
    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token

    // 4. Fetch a sample issue from database
    const issue = await prisma.roadIssue.findFirst()
    sampleIssueId = issue!.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe("1. Audit Logging Service & Pipeline", () => {
    it("Automatically records an audit entry upon user login", async () => {
      const logsBefore = await prisma.auditLog.count({
        where: { action: "USER_LOGIN" },
      })

      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "citizen.test@roadguard.local", password: "Password123!" })

      const logsAfter = await prisma.auditLog.count({
        where: { action: "USER_LOGIN" },
      })

      expect(logsAfter).toBeGreaterThan(logsBefore)
    })

    it("Directly logs administrative action via AuditService.logAction", async () => {
      await AuditService.logAction({
        userId: "admin-id",
        action: "EMERGENCY_DISPATCH_TRIGGERED",
        entityType: "RoadIssue",
        entityId: sampleIssueId,
        details: { severity: "CRITICAL", dispatchedCrew: "Hotmix Rapid 1" },
        ipAddress: "127.0.0.1",
      })

      const recorded = await prisma.auditLog.findFirst({
        where: { action: "EMERGENCY_DISPATCH_TRIGGERED" },
        orderBy: { createdAt: "desc" },
      })

      expect(recorded).toBeDefined()
      expect(recorded!.entityType).toBe("RoadIssue")
      expect(recorded!.entityId).toBe(sampleIssueId)
      expect(recorded!.ipAddress).toBe("127.0.0.1")
      expect(recorded!.details).toContain("Hotmix Rapid 1")
    })

    it("Permits Super Admin to query paginated audit logs via GET /api/v1/audit-logs", async () => {
      const res = await request(app)
        .get("/api/v1/audit-logs?limit=10")
        .set("Authorization", `Bearer ${superAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.logs)).toBe(true)
      expect(res.body.pagination).toBeDefined()
      expect(res.body.pagination.page).toBe(1)
      expect(res.body.pagination.limit).toBe(10)
    })

    it("Denies non-Super Admin (Citizen) from reading audit logs (403 Forbidden)", async () => {
      const res = await request(app)
        .get("/api/v1/audit-logs")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Denies non-Super Admin (Inspector) from reading audit logs (403 Forbidden)", async () => {
      const res = await request(app)
        .get("/api/v1/audit-logs")
        .set("Authorization", `Bearer ${inspectorToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Rejects unauthenticated requests to audit logs (401 Unauthorized)", async () => {
      const res = await request(app).get("/api/v1/audit-logs")

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })
  })

  describe("2. Security Headers & Payload Controls", () => {
    it("Enforces security headers on API responses via Helmet", async () => {
      const res = await request(app).get("/api/health")

      expect(res.status).toBe(200)
      expect(res.headers["x-content-type-options"]).toBe("nosniff")
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN")
      expect(res.headers["content-security-policy"]).toBeDefined()
      expect(res.headers["strict-transport-security"]).toBeDefined()
    })

    it("Rejects requests with prohibited cross-origin headers", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "https://unauthorized-hacker-site.org")

      expect(res.status).toBe(500)
      expect(res.body.error.message).toContain("CORS policy blocked access")
    })
  })
})
