import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"

describe("Phase 13: End-to-End Municipal Lifecycle Integration Tests", () => {
  const citizenTimestamp = Date.now()
  const citizen1Email = `e2e.citizen1.${citizenTimestamp}@roadguard.test`
  const citizen2Email = `e2e.citizen2.${citizenTimestamp}@roadguard.test`
  const password = "Password123!"

  let citizen1Cookie: string
  let citizen1Id: string
  let citizen2Cookie: string
  let inspectorCookie: string
  let deptAdminCookie: string
  let superAdminCookie: string

  let createdIssueId: string
  let createdReportNumber: string
  let createdWorkOrderId: string

  beforeAll(async () => {
    // 1. Log in seeded test accounts
    const superRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@roadguard.local", password })
    superAdminCookie = superRes.headers["set-cookie"][0]

    const deptRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "highways.chief@roadguard.local", password })
    deptAdminCookie = deptRes.headers["set-cookie"][0]

    const inspRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password })
    inspectorCookie = inspRes.headers["set-cookie"][0]

    // 2. Register Citizen 1
    const c1Res = await request(app).post("/api/v1/auth/register").send({
      fullName: "E2E Test Citizen One",
      email: citizen1Email,
      password,
      phoneNumber: "+44 7900 111222",
    })
    citizen1Cookie = c1Res.headers["set-cookie"][0]
    citizen1Id = c1Res.body.data.user.id

    // 3. Register Citizen 2
    const c2Res = await request(app).post("/api/v1/auth/register").send({
      fullName: "E2E Test Citizen Two",
      email: citizen2Email,
      password,
      phoneNumber: "+44 7900 333444",
    })
    citizen2Cookie = c2Res.headers["set-cookie"][0]
  })

  afterAll(async () => {
    try {
      // Clean up test data created during E2E runs
      await prisma.user.deleteMany({
        where: { email: { contains: "@roadguard.test" } },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Citizen Defect Reporting & Corroboration Journey", () => {
    it("Verifies authenticated citizen profile and CITIZEN role restriction", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", citizen1Cookie)

      expect(res.status).toBe(200)
      expect(res.body.data.user.id).toBe(citizen1Id)
      expect(res.body.data.user.role).toBe("CITIZEN")
    })

    it("Pre-checks explainable risk score calculation for severe cavity", async () => {
      const res = await request(app)
        .post("/api/v1/issues/calculate-risk")
        .set("Cookie", citizen1Cookie)
        .send({
          damageCategory: "CAVITY",
          damageSeverity: "CRITICAL",
          depth: 75,
          roadClass: "arterial",
          vehiclesPerHour: 950,
          nearestSensitiveType: "school",
          distanceMeters: 40,
          confirmationsCount: 0,
        })

      expect(res.status).toBe(200)
      expect(res.body.data.score).toBeGreaterThanOrEqual(80)
      expect(res.body.data.level).toBe("CRITICAL")
      expect(res.body.data.factors).toBeDefined()
      expect(res.body.data.explanation).toContain("CRITICAL priority")
    })

    it("Pre-checks duplicate detection before submission (verifies unique location)", async () => {
      const res = await request(app)
        .post("/api/v1/issues/check-duplicate")
        .set("Cookie", citizen1Cookie)
        .send({
          latitude: 51.6850,
          longitude: -0.3200,
          damageCategory: "CAVITY",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.isDuplicate).toBe(false)
      expect(res.body.data.confidencePercentage).toBe(0)
    })

    it("Citizen submits defect report with server-side validation and risk calculation", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Cookie", citizen1Cookie)
        .send({
          title: "Large Void Under Asphalt on City Road",
          description: "Dangerous subsidence creating large impact shock for passing vehicles.",
          damageCategory: "CAVITY",
          damageSeverity: "CRITICAL",
          depth: 70,
          latitude: 19.0544,
          longitude: 72.8267,
          address: "Bandstand Promenade, Bandra West, Mumbai",
          roadClass: "arterial",
          forceDuplicate: true,
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue).toBeDefined()
      expect(res.body.data.issue.reportNumber).toMatch(/^RG-\d+$/)
      expect(res.body.data.issue.status).toBe("REPORTED")
      expect(res.body.data.issue.reportedById).toBe(citizen1Id)

      createdIssueId = res.body.data.issue.id
      createdReportNumber = res.body.data.issue.reportNumber
    })

    it("Citizen retrieves submitted report via /api/v1/issues/my-reports", async () => {
      const res = await request(app)
        .get("/api/v1/issues/my-reports")
        .set("Cookie", citizen1Cookie)

      expect(res.status).toBe(200)
      expect(res.body.data.issues).toBeInstanceOf(Array)
      const found = res.body.data.issues.find((i: any) => i.id === createdIssueId)
      expect(found).toBeDefined()
      expect(found.reportNumber).toBe(createdReportNumber)
    })

    it("Second citizen corroborates/supports the defect, boosting confirmations and risk score", async () => {
      const initialRes = await request(app)
        .get(`/api/v1/issues/${createdIssueId}`)
        .set("Cookie", citizen1Cookie)
      const initialScore = initialRes.body.data.issue.riskScore

      const supportRes = await request(app)
        .post(`/api/v1/issues/${createdIssueId}/support`)
        .set("Cookie", citizen2Cookie)
        .send({
          notes: "Confirmed on morning commute. Significant wheel jar.",
        })

      expect(supportRes.status).toBe(200)
      expect(supportRes.body.data.issue.confirmationsCount).toBe(1)
      expect(supportRes.body.data.issue.riskScore).toBeGreaterThanOrEqual(initialScore)
    })
  })

  describe("2. Inspector Verification & Department Work Order Dispatch Journey", () => {
    it("Field Inspector reviews issue: transitions REPORTED -> UNDER_REVIEW", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Cookie", inspectorCookie)
        .send({
          targetStatus: "UNDER_REVIEW",
          remarks: "Field inspector assigned for acoustic asphalt scan.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.issue.status).toBe("UNDER_REVIEW")
    })

    it("Field Inspector verifies issue: transitions UNDER_REVIEW -> VERIFIED", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Cookie", inspectorCookie)
        .send({
          targetStatus: "VERIFIED",
          remarks: "Physical depth confirmed at 72mm. Structural base compromised.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.issue.status).toBe("VERIFIED")
    })

    it("Denies Citizen from transitioning defect status (RBAC boundary guard)", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${createdIssueId}/status`)
        .set("Cookie", citizen1Cookie)
        .send({
          targetStatus: "ASSIGNED",
          remarks: "Unauthorized attempt by citizen",
        })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Department Admin dispatches work order to repair crew, auto-updating issue to ASSIGNED", async () => {
      // Fetch seeded Inspector ID to assign work
      const inspectorUser = await prisma.user.findFirst({
        where: { role: "INSPECTOR" },
      })
      expect(inspectorUser).toBeDefined()

      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Cookie", deptAdminCookie)
        .send({
          issueId: createdIssueId,
          workDescription: "Milling, asphalt binder course laying and hot-mix compaction.",
          priority: "HIGH",
          assignedToId: inspectorUser!.id,
          scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.workOrder.id).toBeDefined()
      expect(res.body.data.workOrder.issueId).toBe(createdIssueId)

      createdWorkOrderId = res.body.data.workOrder.id

      // Verify linked road issue moved to ASSIGNED
      const issueRes = await request(app).get(`/api/v1/issues/${createdIssueId}`)
      expect(issueRes.body.data.issue.status).toBe("ASSIGNED")
    })

    it("Crew transitions work order to IN_PROGRESS", async () => {
      const res = await request(app)
        .patch(`/api/v1/work-orders/${createdWorkOrderId}/status`)
        .set("Cookie", inspectorCookie)
        .send({
          status: "IN_PROGRESS",
          notes: "Traffic management cones placed. Milling machine operational.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.workOrder.status).toBe("IN_PROGRESS")
    })

    it("Crew completes work order, automatically transitioning RoadIssue to REPAIR_COMPLETED", async () => {
      const res = await request(app)
        .patch(`/api/v1/work-orders/${createdWorkOrderId}/status`)
        .set("Cookie", inspectorCookie)
        .send({
          status: "COMPLETED",
          notes: "Compacted hot-mix asphalt installed. Surface leveled and sealed.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.workOrder.status).toBe("COMPLETED")

      // Verify linked road issue transitioned to REPAIR_COMPLETED
      const issueRes = await request(app).get(`/api/v1/issues/${createdIssueId}`)
      expect(issueRes.body.data.issue.status).toBe("REPAIR_COMPLETED")
    })

    it("Reporting Citizen receives notification of work order dispatch and repair completion", async () => {
      const res = await request(app)
        .get("/api/v1/auth/notifications")
        .set("Cookie", citizen1Cookie)

      expect(res.status).toBe(200)
      expect(res.body.data.notifications).toBeInstanceOf(Array)
      expect(res.body.data.notifications.length).toBeGreaterThanOrEqual(1)

      const dispatchNotif = res.body.data.notifications.find((n: any) =>
        n.title.includes(createdReportNumber),
      )
      expect(dispatchNotif).toBeDefined()
      expect(dispatchNotif.isRead).toBe(false)

      // Citizen marks notification as read
      const markRes = await request(app)
        .patch(`/api/v1/auth/notifications/${dispatchNotif.id}/read`)
        .set("Cookie", citizen1Cookie)

      expect(markRes.status).toBe(200)
      expect(markRes.body.data.count).toBe(1)
    })
  })

  describe("3. Super Admin Governance & Immutable Audit Logging Journey", () => {
    it("Super Admin accesses live municipal dashboard analytics", async () => {
      const res = await request(app)
        .get("/api/v1/analytics/dashboard")
        .set("Cookie", superAdminCookie)

      expect(res.status).toBe(200)
      expect(res.body.data.totalReported).toBeGreaterThanOrEqual(1)
      expect(res.body.data.verifiedRepaired).toBeGreaterThanOrEqual(1)
    })

    it("Super Admin accesses immutable audit logs containing full operational trail", async () => {
      const res = await request(app)
        .get("/api/v1/audit-logs?limit=100")
        .set("Cookie", superAdminCookie)

      expect(res.status).toBe(200)
      expect(res.body.data.logs).toBeInstanceOf(Array)

      const actions = res.body.data.logs.map((l: any) => l.action)
      expect(actions).toContain("USER_REGISTER")
      expect(actions).toContain("USER_LOGIN")
      expect(actions).toContain("ISSUE_CREATED")
      expect(actions).toContain("WORK_ORDER_DISPATCHED")
    })

    it("Denies non-Super-Admin (Citizen & Inspector) access to municipal audit logs (403)", async () => {
      const citizenRes = await request(app)
        .get("/api/v1/audit-logs?limit=100")
        .set("Cookie", citizen1Cookie)
      expect(citizenRes.status).toBe(403)

      const inspectorRes = await request(app)
        .get("/api/v1/audit-logs?limit=100")
        .set("Cookie", inspectorCookie)
      expect(inspectorRes.status).toBe(403)
    })
  })

  describe("4. Edge Cases, Validation Guards & Error Boundaries", () => {
    it("Rejects non-existent issue ID with clean 404 Not Found", async () => {
      const res = await request(app).get(
        "/api/v1/issues/00000000-0000-0000-0000-000000000000",
      )
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("Rejects invalid coordinates (latitude > 90) with 400 Validation Error", async () => {
      const res = await request(app)
        .post("/api/v1/issues")
        .set("Cookie", citizen1Cookie)
        .send({
          title: "Boundary Test Pothole",
          description: "Test description",
          damageCategory: "CAVITY",
          damageSeverity: "HIGH",
          depth: 40,
          latitude: 95.0, // Invalid lat!
          longitude: 0.0,
          address: "North Pole Border",
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("Rejects citizen attempting to dispatch work order with 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Cookie", citizen1Cookie)
        .send({
          issueId: createdIssueId,
          workDescription: "Unauthorized citizen dispatch",
          priority: "CRITICAL",
        })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })
})
