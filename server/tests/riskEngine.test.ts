import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { DamageCategory, DamageSeverity, IssueStatus } from "@prisma/client"

describe("Phase 8: Server-Side Risk Scoring & Duplicate Detection Engine Tests", () => {
  let citizenToken: string
  let testIssueId: string
  let testReportNumber: string

  const anchorLat = 51.5134
  const anchorLon = -0.1312

  beforeAll(async () => {
    // 1. Log in citizen
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token

    // 2. Create an anchor issue for spatial duplicate testing
    const issue = await prisma.roadIssue.create({
      data: {
        reportNumber: `RG-RSK-${Math.floor(1000 + Math.random() * 9000)}`,
        title: "Soho Square Asphalt Pavement Trench",
        description: "Hazardous void right near primary school crossing.",
        damageCategory: DamageCategory.CAVITY,
        damageSeverity: DamageSeverity.CRITICAL,
        depth: 85,
        latitude: anchorLat,
        longitude: anchorLon,
        address: "Soho Square, London",
        status: IssueStatus.VERIFIED,
      },
    })
    testIssueId = issue.id
    testReportNumber = issue.reportNumber
  })

  afterAll(async () => {
    try {
      await prisma.roadIssue.deleteMany({
        where: { id: testIssueId },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Explainable Risk Assessment (POST /api/v1/issues/calculate-risk)", () => {
    it("Calculates CRITICAL priority score with explainable breakdown for deep cavity on arterial road", async () => {
      const res = await request(app)
        .post("/api/v1/issues/calculate-risk")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.CRITICAL,
          depth: 85,
          roadClass: "arterial",
          vehiclesPerHour: 750,
          nearestSensitiveType: "school",
          distanceMeters: 45,
          confirmationsCount: 3,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeDefined()

      const assessment = res.body.data
      expect(assessment.score).toBeGreaterThanOrEqual(80)
      expect(assessment.level).toBe("CRITICAL")

      // Verify factor breakdowns
      expect(assessment.factors).toBeDefined()
      expect(assessment.factors.damageSeverity).toBeGreaterThanOrEqual(90)
      expect(assessment.factors.roadUsage).toBeGreaterThanOrEqual(80)
      expect(assessment.factors.sensitiveProximity).toBeGreaterThanOrEqual(90)
      expect(assessment.factors.supportingReports).toBeGreaterThanOrEqual(70)

      // Verify mathematical contributions
      expect(assessment.weightedContributions).toBeDefined()
      expect(assessment.weightedContributions.damageSeverity).toBeGreaterThan(0)
      expect(assessment.weightedContributions.roadUsage).toBeGreaterThan(0)

      // Verify natural-language explanation and recommended action
      expect(assessment.explanation).toContain("CRITICAL priority")
      expect(assessment.explanation).toContain("pts")
      expect(assessment.recommendedAction).toContain("Immediate emergency dispatch")
    })

    it("Calculates LOW/MODERATE priority score for minor crack on local street", async () => {
      const res = await request(app)
        .post("/api/v1/issues/calculate-risk")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          damageCategory: DamageCategory.CRACK,
          damageSeverity: DamageSeverity.LOW,
          depth: 5,
          roadClass: "local",
          nearestSensitiveType: "none",
          distanceMeters: 800,
          confirmationsCount: 1,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      const assessment = res.body.data
      expect(assessment.score).toBeLessThanOrEqual(45)
      expect(["LOW", "MODERATE"]).toContain(assessment.level)
      expect(assessment.recommendedAction).toContain("routine")
    })

    it("Depth scaling increases damage severity factor proportionally", async () => {
      const resShallow = await request(app)
        .post("/api/v1/issues/calculate-risk")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          damageCategory: DamageCategory.CAVITY,
          depth: 15,
        })

      const resDeep = await request(app)
        .post("/api/v1/issues/calculate-risk")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          damageCategory: DamageCategory.CAVITY,
          depth: 80,
        })

      expect(resDeep.body.data.factors.damageSeverity).toBeGreaterThan(
        resShallow.body.data.factors.damageSeverity,
      )
    })

    it("Rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/issues/calculate-risk")
        .send({
          damageCategory: DamageCategory.CAVITY,
        })

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })
  })

  describe("2. Real-Time Spatial Duplicate Pre-Check (POST /api/v1/issues/check-duplicate)", () => {
    it("Detects duplicate report within 40m radius and returns candidate issue details", async () => {
      // 12 meters away from anchor (0.0001 deg lat ~= 11.1 meters)
      const nearbyLat = anchorLat + 0.0001
      const nearbyLon = anchorLon + 0.00005

      const res = await request(app)
        .post("/api/v1/issues/check-duplicate")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          latitude: nearbyLat,
          longitude: nearbyLon,
          damageCategory: DamageCategory.CAVITY,
          thresholdMeters: 40,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeDefined()

      const dup = res.body.data
      expect(dup.isDuplicate).toBe(true)
      expect(dup.distanceMeters).toBeLessThan(40)
      expect(dup.existingIssue).toBeDefined()
      expect(dup.existingIssue.id).toBe(testIssueId)
      expect(dup.existingIssue.reportNumber).toBe(testReportNumber)
      expect(dup.confidencePercentage).toBeGreaterThanOrEqual(60)
      expect(dup.categoryMatch).toBe(true)
      expect(dup.reason).toContain("Soho Square")
    })

    it("Returns isDuplicate: false when distance exceeds the 40m threshold", async () => {
      // 0.01 deg lat ~= 1113 meters away
      const farLat = anchorLat + 0.01
      const farLon = anchorLon + 0.01

      const res = await request(app)
        .post("/api/v1/issues/check-duplicate")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          latitude: farLat,
          longitude: farLon,
          damageCategory: DamageCategory.CAVITY,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.isDuplicate).toBe(false)
      expect(res.body.data.confidencePercentage).toBe(0)
    })

    it("Rejects invalid coordinates with 400 Bad Request", async () => {
      const res = await request(app)
        .post("/api/v1/issues/check-duplicate")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          latitude: 105.0, // Invalid latitude > 90
          longitude: -0.12,
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })
  })
})

