import { beforeAll, afterAll, describe, expect, it } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"

describe("Phase 10: Live Admin & Department Dashboard Analytics Tests", () => {
  let adminToken: string
  let testWardId: string
  let testDepartmentId: string

  beforeAll(async () => {
    // Authenticate as Super Admin
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@roadguard.local", password: "Password123!" })
    adminToken = loginRes.body.data.token

    // Fetch sample ward and department from database
    const ward = await prisma.ward.findFirst()
    testWardId = ward!.id

    const dept = await prisma.department.findFirst()
    testDepartmentId = dept!.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe("1. City Operational Dashboard Metrics (GET /api/v1/analytics/dashboard)", () => {
    it("Retrieves aggregated metrics from live SQLite database records", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/dashboard")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeDefined()

      const metrics = res.body.data
      expect(typeof metrics.totalReported).toBe("number")
      expect(typeof metrics.activeHazards).toBe("number")
      expect(typeof metrics.criticalEmergencies).toBe("number")
      expect(typeof metrics.repairsInProgress).toBe("number")
      expect(typeof metrics.verifiedRepaired).toBe("number")
      expect(typeof metrics.averageRiskScore).toBe("number")
      expect(Array.isArray(metrics.wardBreakdown)).toBe(true)
      expect(metrics.wardBreakdown.length).toBeGreaterThan(0)
      expect(Array.isArray(metrics.departmentBreakdown)).toBe(true)
      expect(metrics.departmentBreakdown.length).toBeGreaterThan(0)
      expect(metrics.categoryBreakdown).toBeDefined()
      expect(metrics.severityBreakdown).toBeDefined()
    })

    it("Permits public / unauthenticated access to city transparency metrics", async () => {
      const res = await request(app).get("/api/v1/analytics/dashboard")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.totalReported).toBeGreaterThan(0)
    })

    it("Filters metrics by specific municipal ward ID", async () => {
      const res = await request(app)
        .get(`/api/v1/analytics/dashboard?wardId=${testWardId}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.totalReported).toBe("number")
    })

    it("Filters metrics by specific department ID", async () => {
      const res = await request(app)
        .get(`/api/v1/analytics/dashboard?departmentId=${testDepartmentId}`)
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.totalReported).toBe("number")
    })

    it("Rejects malformed UUID filter parameters with 400 Bad Request", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/dashboard?wardId=not-a-valid-uuid")
        .set("Authorization", `Bearer ${adminToken}`)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })
  })

  describe("2. Municipal Metadata & Filter Discovery (GET /api/v1/analytics/metadata)", () => {
    it("Retrieves active departments and municipal wards for UI dropdowns", async () => {
      const res = await request(app).get("/api/v1/analytics/metadata")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.departments)).toBe(true)
      expect(res.body.data.departments.length).toBeGreaterThanOrEqual(3)
      expect(Array.isArray(res.body.data.wards)).toBe(true)
      expect(res.body.data.wards.length).toBeGreaterThanOrEqual(4)

      // Verify department schema
      const firstDept = res.body.data.departments[0]
      expect(firstDept.id).toBeDefined()
      expect(firstDept.name).toBeDefined()
      expect(firstDept.contactEmail).toBeDefined()

      // Verify ward schema
      const firstWard = res.body.data.wards[0]
      expect(firstWard.id).toBeDefined()
      expect(firstWard.name).toBeDefined()
      expect(firstWard.wardCode).toBeDefined()
      expect(firstWard.city).toBe("London")
    })
  })
})

