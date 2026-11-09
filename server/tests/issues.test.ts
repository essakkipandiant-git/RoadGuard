import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { DamageCategory, DamageSeverity, IssueStatus } from "@prisma/client"

describe("Phase 5: Road Issue Reporting APIs & Spatial Deduplication Tests", () => {
  let citizenToken: string
  let citizenUserId: string
  let inspectorToken: string
  let deptAdminToken: string

  let createdIssueId: string
  let createdReportNumber: string

  // Distinct test coordinates in Dadar West, Mumbai (G/North Ward)
  const baseLat = 19.0269
  const baseLon = 72.8378

  beforeAll(async () => {
    // Log in seeded citizen
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
    citizenUserId = citizenRes.body.data.user.id

    // Log in seeded inspector
    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token

    // Log in seeded department admin
    const deptRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "highways.chief@roadguard.local", password: "Password123!" })
    deptAdminToken = deptRes.body.data.token
  })

  afterAll(async () => {
    try {
      // Clean up issues created during tests
      await prisma.roadIssue.deleteMany({
        where: {
          address: { contains: "Phase 5 Test Road" },
        },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Road Issue Creation (POST /api/v1/issues)", () => {
    it("Successfully creates a road hazard report with valid inputs and calculated risk score", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Deep Asphalt Pothole near Victoria Station",
          description: "Dangerous cavity expanding rapidly following recent heavy rains.",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.HIGH,
          depth: 65,
          latitude: baseLat,
          longitude: baseLon,
          address: "100 Phase 5 Test Road, London",
          photoUrl: "https://res.cloudinary.com/roadguard/image/upload/v1/samples/pothole_01.jpg",
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue).toBeDefined()

      const issue = res.body.data.issue
      createdIssueId = issue.id
      createdReportNumber = issue.reportNumber

      expect(issue.reportNumber).toMatch(/^RG-\d{5}$/)
      expect(issue.status).toBe(IssueStatus.REPORTED)
      expect(issue.damageCategory).toBe(DamageCategory.CAVITY)
      expect(issue.damageSeverity).toBe(DamageSeverity.HIGH)
      expect(issue.depth).toBe(65)
      expect(issue.latitude).toBeCloseTo(baseLat, 4)
      expect(issue.longitude).toBeCloseTo(baseLon, 4)
      expect(issue.reportedById).toBe(citizenUserId)
      expect(issue.confirmationsCount).toBe(0)

      // Risk score should be calculated server-side:
      // High severity base (65) + Cavity offset (10) + Depth >= 50mm (10) = 85
      expect(issue.riskScore).toBeGreaterThanOrEqual(80)

      // Verify associated image was recorded
      expect(issue.images).toBeDefined()
      expect(issue.images.length).toBeGreaterThanOrEqual(1)
      expect(issue.images[0].imageUrl).toContain("pothole_01.jpg")
    })

    it("Rejects unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .send({
          title: "Unauthorized Report Attempt",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.LOW,
          latitude: 51.5,
          longitude: -0.1,
          address: "Test Location",
        })

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("Validates coordinates and rejects out-of-range latitude (> 90)", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Invalid Latitude Pothole",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.LOW,
          latitude: 99.1234, // Invalid latitude
          longitude: -0.12,
          address: "North Pole Border",
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("Validates coordinates and rejects out-of-range longitude (> 180)", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Invalid Longitude Pothole",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.LOW,
          latitude: 18.9438,
          longitude: 250.0, // Invalid longitude
          address: "Far East",
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })

    it("Rejects reports missing required address string", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Missing Address Road Issue",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.LOW,
          latitude: 18.9438,
          longitude: 72.8232,
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  describe("2. Server-Side Spatial Duplicate Detection (40m Radius)", () => {
    it("Detects duplicate report within 10 meters and returns 409 Conflict with existing issue details", async () => {
      // Offset by approx 8 meters (0.00007 deg lat ~= 7.8 meters)
      const nearbyLat = baseLat + 0.00007
      const nearbyLon = baseLon + 0.00003

      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Second Report of Same Pothole",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.HIGH,
          latitude: nearbyLat,
          longitude: nearbyLon,
          address: "102 Phase 5 Test Road, London",
        })

      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("CONFLICT")
      expect(res.body.error.message).toContain("already exists within")
      expect(res.body.error.details).toBeDefined()
      expect(res.body.error.details.isDuplicate).toBe(true)
      expect(res.body.error.details.existingIssueId).toBe(createdIssueId)
      expect(res.body.error.details.existingReportNumber).toBe(createdReportNumber)
      expect(res.body.error.details.distanceMeters).toBeLessThan(40)
    })

    it("Allows intentional creation when forceDuplicate: true is specified", async () => {
      const nearbyLat = baseLat + 0.00007
      const nearbyLon = baseLon + 0.00003

      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Separate Distinct Hole Right Next Door",
          damageCategory: DamageCategory.CAVITY,
          damageSeverity: DamageSeverity.MODERATE,
          latitude: nearbyLat,
          longitude: nearbyLon,
          address: "104 Phase 5 Test Road, London",
          forceDuplicate: true, // Citizen override flag
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue).toBeDefined()
    })

    it("Permits creation when distance exceeds 40m radius threshold", async () => {
      // 0.005 degrees latitude ~= 556 meters away
      const distantLat = baseLat + 0.005
      const distantLon = baseLon + 0.005

      const res = await request(app)
        .post("/api/v1/issues")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          title: "Far Away Pothole in Neighbouring Ward",
          damageCategory: DamageCategory.CRACK,
          damageSeverity: DamageSeverity.LOW,
          latitude: distantLat,
          longitude: distantLon,
          address: "800 Phase 5 Test Road, London",
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue).toBeDefined()
    })
  })

  describe("3. Community Duplicate Corroboration / Support (POST /api/v1/issues/:id/support)", () => {
    it("Increments confirmation count and recalculates risk score when citizen supports an issue", async () => {
      const originalIssue = await prisma.roadIssue.findUnique({
        where: { id: createdIssueId },
      })
      const initialScore = originalIssue!.riskScore
      const initialConfirmations = originalIssue!.confirmationsCount

      const res = await request(app)
        .post(`/api/v1/issues/${createdIssueId}/support`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          notes: "I hit this exact pothole this morning; tyre pressure was lost.",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue).toBeDefined()

      const updated = res.body.data.issue
      expect(updated.confirmationsCount).toBe(initialConfirmations + 1)
      expect(updated.riskScore).toBeGreaterThanOrEqual(initialScore)

      // Verify a status history note was logged
      const history = await prisma.statusHistory.findFirst({
        where: {
          issueId: createdIssueId,
          remarks: { contains: "tyre pressure" },
        },
      })
      expect(history).toBeDefined()
    })

    it("Rejects support for non-existent issue with 404 Not Found", async () => {
      const res = await request(app)
        .post("/api/v1/issues/non-existent-uuid/support")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({ notes: "Ghost defect" })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("4. List & Query Issues (GET /api/v1/issues)", () => {
    it("Lists issues with pagination metadata", async () => {
      const res = await request(app)
        .get("/api/v1/issues?page=1&limit=2")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.issues)).toBe(true)
      expect(res.body.data.issues.length).toBeLessThanOrEqual(2)
      expect(res.body.pagination).toBeDefined()
      expect(res.body.pagination.page).toBe(1)
      expect(res.body.pagination.limit).toBe(2)
      expect(res.body.pagination.totalRecords).toBeGreaterThan(0)
    })

    it("Filters issues by status: REPORTED", async () => {
      const res = await request(app)
        .get("/api/v1/issues?status=REPORTED")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const allReported = res.body.data.issues.every((i: any) => i.status === "REPORTED")
      expect(allReported).toBe(true)
    })

    it("Filters issues by damage category: CAVITY", async () => {
      const res = await request(app)
        .get("/api/v1/issues?category=CAVITY")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const allCavities = res.body.data.issues.every((i: any) => i.damageCategory === "CAVITY")
      expect(allCavities).toBe(true)
    })

    it("Searches issues by address query string", async () => {
      const res = await request(app)
        .get("/api/v1/issues?search=Phase%205%20Test%20Road")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issues.length).toBeGreaterThan(0)
      expect(res.body.data.issues[0].address).toContain("Phase 5 Test Road")
    })
  })

  describe("5. Citizen's Own Reports (GET /api/v1/issues/my-reports)", () => {
    it("Retrieves reports submitted by the logged-in citizen", async () => {
      const res = await request(app)
        .get("/api/v1/issues/my-reports")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.issues)).toBe(true)
      expect(res.body.data.issues.length).toBeGreaterThan(0)

      const myReportIds = res.body.data.issues.map((i: any) => i.id)
      expect(myReportIds).toContain(createdIssueId)
    })
  })

  describe("6. Issue Detail by ID & Report Number (GET /api/v1/issues/:id)", () => {
    it("Retrieves issue by internal UUID with full relational details", async () => {
      const res = await request(app)
        .get(`/api/v1/issues/${createdIssueId}`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.id).toBe(createdIssueId)
      expect(res.body.data.issue.ward).toBeDefined()
      expect(res.body.data.issue.department).toBeDefined()
      expect(res.body.data.issue.statusHistory).toBeDefined()
      expect(res.body.data.issue.statusHistory.length).toBeGreaterThan(0)
    })

    it("Retrieves issue by public report number (e.g. RG-XXXXX)", async () => {
      const res = await request(app)
        .get(`/api/v1/issues/${createdReportNumber}`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.id).toBe(createdIssueId)
      expect(res.body.data.issue.reportNumber).toBe(createdReportNumber)
    })

    it("Returns 404 Not Found for non-existent issue identifier", async () => {
      const res = await request(app)
        .get("/api/v1/issues/RG-99999-DOES-NOT-EXIST")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("7. Defect Lifecycle Status Transitions (PATCH /api/v1/issues/:id/status)", () => {
    it("Allows Inspector to transition issue from REPORTED to UNDER_REVIEW", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          targetStatus: IssueStatus.UNDER_REVIEW,
          remarks: "Officer dispatched for on-site visual survey.",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.status).toBe(IssueStatus.UNDER_REVIEW)
    })

    it("Allows Inspector to transition UNDER_REVIEW to VERIFIED with evidence photo", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          targetStatus: IssueStatus.VERIFIED,
          remarks: "Confirmed severe asphalt base deterioration.",
          evidencePhotoUrl: "https://res.cloudinary.com/roadguard/image/upload/v1/evidence/inspected_pothole.jpg",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.status).toBe(IssueStatus.VERIFIED)

      // Verify notification was generated for the reporting citizen
      const notification = await prisma.notification.findFirst({
        where: {
          userId: citizenUserId,
          title: { contains: createdReportNumber },
        },
        orderBy: {
          createdAt: "desc",
        },
      })
      expect(notification).toBeDefined()
      expect(notification!.message).toContain("VERIFIED")
    })

    it("Denies Citizen from transitioning VERIFIED to ASSIGNED (403 Forbidden)", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          targetStatus: IssueStatus.ASSIGNED,
          remarks: "Citizen trying to assign work crew.",
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Allows Department Admin to transition VERIFIED to ASSIGNED", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          targetStatus: IssueStatus.ASSIGNED,
          remarks: "Contractor assigned for milling and hot-mix patching.",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.status).toBe(IssueStatus.ASSIGNED)
    })

    it("Rejects invalid / backward transition (ASSIGNED -> REPORTED) with 403 Forbidden", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          targetStatus: IssueStatus.REPORTED,
          remarks: "Illegal backwards step",
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })
})
