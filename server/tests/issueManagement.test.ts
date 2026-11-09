import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { DamageCategory, DamageSeverity, IssueStatus } from "@prisma/client"

describe("Phase D: Pothole Workspace & Action Management APIs", () => {
  let citizenToken: string
  let citizenUserId: string
  let inspectorToken: string
  let deptAdminToken: string
  let superAdminToken: string

  let testIssueId: string
  let testReportNumber: string

  // Unique coordinates in Chembur, Mumbai (M/West Ward)
  const chemburLat = 19.0622
  const chemburLon = 72.8995

  beforeAll(async () => {
    // 1. Citizen Login
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
    citizenUserId = citizenRes.body.data.user.id

    // 2. Inspector / Field Admin Login
    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token

    // 3. Dept Admin Login
    const deptRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "highways.chief@roadguard.local", password: "Password123!" })
    deptAdminToken = deptRes.body.data.token

    // 4. Super Admin Login
    const adminRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@roadguard.local", password: "Password123!" })
    superAdminToken = adminRes.body.data.token

    // Create a fresh test issue
    const createRes = await request(app)
      .post("/api/v1/issues")
      .set("Authorization", `Bearer ${citizenToken}`)
      .send({
        title: "Phase D Workspace Test Cavity Chembur",
        description: "Initial citizen report for full-page management workspace validation.",
        damageCategory: DamageCategory.CAVITY,
        damageSeverity: DamageSeverity.HIGH,
        depth: 65,
        latitude: chemburLat,
        longitude: chemburLon,
        address: "Sion-Trombay Road, Chembur, Mumbai",
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
          address: { contains: "Chembur, Mumbai" },
        },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Chronological Timeline Verification (GET /api/v1/issues/:id/timeline)", () => {
    it("TC-D01: Returns chronological timeline with initial citizen report event", async () => {
      const res = await request(app)
        .get(`/api/v1/issues/${testIssueId}/timeline`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.id).toBe(testIssueId)
      expect(res.body.data.timeline.length).toBeGreaterThanOrEqual(1)

      const initialEvent = res.body.data.timeline[0]
      expect(initialEvent.eventType).toBe("REPORT_SUBMITTED")
      expect(initialEvent.status).toBe("REPORTED")
      expect(initialEvent.actorRole).toBe("CITIZEN")
      expect(initialEvent.actionTitle).toContain("Pothole reported")
    })

    it("TC-D02: Resolves timeline via public reportNumber (e.g. RG-XXXXX)", async () => {
      const res = await request(app)
        .get(`/api/v1/issues/${testReportNumber}/timeline`)

      expect(res.status).toBe(200)
      expect(res.body.data.issue.reportNumber).toBe(testReportNumber)
    })
  })

  describe("2. Official Department & Government Reference (PATCH /api/v1/issues/:id/official-info)", () => {
    it("TC-D03: Citizens are forbidden from modifying official department details", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${testIssueId}/official-info`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          governmentReferenceId: "BMC-CR-2026-9999",
        })

      expect(res.status).toBe(403)
    })

    it("TC-D04: Dept Admin successfully attaches external MCGM reference and helpline", async () => {
      const res = await request(app)
        .patch(`/api/v1/issues/${testIssueId}/official-info`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          governmentReferenceId: "MCGM/ROADS/2026/78219",
          governmentPortalUrl: "https://portal.mcgm.gov.in/grievance/78219",
          officialDepartmentName: "Brihanmumbai Municipal Corporation - Roads & Traffic",
          officialContactInfo: "Helpline: 1916 / roads.mumbai@mcgm.gov.in",
          externalStatus: "Registered with Executive Engineer",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.issue.governmentReferenceId).toBe("MCGM/ROADS/2026/78219")
      expect(res.body.data.issue.officialDepartmentName).toContain("Brihanmumbai Municipal Corporation")
    })
  })

  describe("3. Authorized Municipal Lifecycle Actions (POST /api/v1/issues/:id/actions)", () => {
    it("TC-D05: Citizen cannot execute official actions", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          actionType: "VERIFY_REPORT",
        })

      expect(res.status).toBe(403)
    })

    it("TC-D06: Field Inspector verifies report", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          actionType: "VERIFY_REPORT",
          remarks: "Field assessment confirmed 65mm asphalt depth cavity.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.issue.status).toBe("VERIFIED")
      expect(res.body.data.approvalRecord.actionType).toBe("VERIFY_REPORT")
    })

    it("TC-D07: Reject report requires reason", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          actionType: "REJECT_REPORT",
        })

      expect(res.status).toBe(400)
    })

    it("TC-D08: Dept Admin dispatches work order", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          actionType: "DISPATCH_WORK_ORDER",
          workDescription: "Hot-mix asphalt filling and mechanical compaction",
          priority: "HIGH",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.issue.status).toBe("ASSIGNED")
    })

    it("TC-D08B: Admin can assign field inspector and update status directly", async () => {
      const inspector = await prisma.user.findFirst({ where: { role: "INSPECTOR" } })
      expect(inspector).toBeTruthy()

      // 1. Assign Inspector
      const assignRes = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          actionType: "ASSIGN_INSPECTOR",
          assignedInspectorId: inspector!.id,
          remarks: "Dispatched Senior Inspector for immediate on-site structural audit.",
        })

      expect(assignRes.status).toBe(200)
      expect(assignRes.body.data.issue.assignedInspectorId).toBe(inspector!.id)

      // 2. Direct Status Update
      const statusRes = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({
          actionType: "UPDATE_STATUS",
          targetStatus: "IN_PROGRESS",
          remarks: "Executive override: asphalt crew mobilized on site.",
        })

      expect(statusRes.status).toBe(200)
      expect(statusRes.body.data.issue.status).toBe("IN_PROGRESS")
      expect(statusRes.body.data.approvalRecord).toBeTruthy()
    })

    it("TC-D09: Inspector submits repair evidence", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          actionType: "SUBMIT_REPAIR_EVIDENCE",
          remarks: "Hot asphalt laid and leveled to grade.",
          evidencePhotos: ["https://images.unsplash.com/photo-1515162816999-a0c47dc192f7"],
        })

      expect(res.status).toBe(200)
      expect(res.body.data.issue.status).toBe("REPAIR_COMPLETED")
    })

    it("TC-D10: Dept Admin approves repair and closes issue", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/actions`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          actionType: "APPROVE_REPAIR",
          remarks: "Quality inspected and approved. Surface restored.",
        })

      expect(res.status).toBe(200)
      expect(res.body.data.issue.status).toBe("CLOSED")
    })

    it("TC-D11: Timeline shows complete chronological audit log of all actions", async () => {
      const res = await request(app)
        .get(`/api/v1/issues/${testIssueId}/timeline`)

      expect(res.status).toBe(200)
      const events = res.body.data.timeline
      expect(events.length).toBeGreaterThanOrEqual(4)

      // Verify chronological ordering
      for (let i = 1; i < events.length; i++) {
        const prevTime = new Date(events[i - 1].timestamp).getTime()
        const currTime = new Date(events[i].timestamp).getTime()
        expect(currTime).toBeGreaterThanOrEqual(prevTime)
      }
    })
  })
})
