import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { DamageCategory, DamageSeverity, IssueStatus } from "@prisma/client"

describe("Phase E: Smart Deduplication & Citizen Evidence Pipeline Tests", () => {
  let citizenToken: string
  let citizenUserId: string
  let inspectorToken: string
  let deptAdminToken: string

  let testIssueId: string
  let testReportNumber: string

  // Unique coordinates in Bandra Kurla Complex (BKC), Mumbai
  const bkcLat = 19.0657
  const bkcLon = 72.8688

  beforeAll(async () => {
    // 1. Citizen Login
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
    citizenUserId = citizenRes.body.data.user.id

    // 2. Inspector Login
    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token

    // 3. Dept Admin Login
    const deptRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "highways.chief@roadguard.local", password: "Password123!" })
    deptAdminToken = deptRes.body.data.token

    // Create a fresh test issue
    const createRes = await request(app)
      .post("/api/v1/issues")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        title: "Phase E Community Pipeline Test BKC",
        description: "Test issue for smart duplicate detection and citizen evidence review.",
        damageCategory: DamageCategory.CAVITY,
        damageSeverity: DamageSeverity.HIGH,
        depth: 70,
        latitude: bkcLat,
        longitude: bkcLon,
        address: "Bandra Kurla Complex Road, Mumbai",
        forceDuplicate: true,
      })

    expect(createRes.status).toBe(201)
    testIssueId = createRes.body.data.issue.id
    testReportNumber = createRes.body.data.issue.reportNumber
  })

  afterAll(async () => {
    try {
      await prisma.roadIssue.deleteMany({
        where: {
          address: { contains: "Bandra Kurla Complex Road, Mumbai" },
        },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Smart Proximity Duplicate Detection", () => {
    it("TC-E01: Detects proximity duplicate within 40m and returns existing report candidate", async () => {
      const res = await request(app)
        .post("/api/v1/issues/check-duplicate")
        .send({
          latitude: bkcLat + 0.0001, // ~11 meters away
          longitude: bkcLon + 0.0001,
          thresholdMeters: 40,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.isDuplicate).toBe(true)
      expect(res.body.data.existingIssue.id).toBe(testIssueId)
      expect(res.body.data.distanceMeters).toBeLessThan(40)
    })
  })

  describe("2. Citizen Community Observations & Evidence Submissions", () => {
    it("TC-E02: Citizen submits STILL_EXISTS observation; increments confirmations count", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/community-updates`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          updateType: "STILL_EXISTS",
          description: "Pothole still present and water ponding has accumulated.",
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.update.updateType).toBe("STILL_EXISTS")
      expect(res.body.data.issue.confirmationsCount).toBeGreaterThanOrEqual(1)
    })

    it("TC-E03: Citizen submits WORSENED observation; recalculates priority risk score", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/community-updates`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          updateType: "WORSENED",
          description: "Edge breakdown has spread across the left traffic lane.",
        })

      expect(res.status).toBe(201)
      expect(res.body.data.update.updateType).toBe("WORSENED")
      expect(res.body.data.issue.riskScore).toBeGreaterThanOrEqual(50)
    })

    let repairClaimUpdateId: string

    it("TC-E04: Citizen submits APPEARS_REPAIRED claim; enters PENDING review without altering issue status", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/community-updates`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          updateType: "APPEARS_REPAIRED",
          description: "Observed new asphalt cold-mix compaction laid yesterday evening.",
          photos: ["https://images.unsplash.com/photo-1515162816999-a0c47dc192f7"],
        })

      expect(res.status).toBe(201)
      expect(res.body.data.update.updateType).toBe("APPEARS_REPAIRED")
      expect(res.body.data.update.verificationStatus).toBe("PENDING")
      // Separation of duties: Status must NOT be REPAIR_COMPLETED yet!
      expect(res.body.data.issue.status).toBe("REPORTED")

      repairClaimUpdateId = res.body.data.update.id
    })

    it("TC-E05: Citizens are forbidden from approving or reviewing repair claims", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${testIssueId}/community-updates/${repairClaimUpdateId}/review`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          decision: "APPROVED",
          adminRemarks: "Trying to self-approve.",
        })

      expect(res.status).toBe(403)
    })

    it("TC-E06: Authorized Inspector formally approves repair claim; transitions issue to REPAIR_COMPLETED", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${testIssueId}/community-updates/${repairClaimUpdateId}/review`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          decision: "APPROVED",
          adminRemarks: "On-site inspection confirmed proper compaction and level asphalt finish.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.update.verificationStatus).toBe("VERIFIED")
      expect(res.body.data.issue.status).toBe("REPAIR_COMPLETED")

      // Verify approval record was created
      const approvalRecord = await prisma.approvalRecord.findFirst({
        where: {
          issueId: testIssueId,
          actionType: "APPROVE_REPAIR",
        },
      })
      expect(approvalRecord).not.toBeNull()
      expect(approvalRecord?.remarks).toContain("On-site inspection confirmed")
    })
  })
})

