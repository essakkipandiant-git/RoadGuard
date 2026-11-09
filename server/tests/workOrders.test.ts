import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import {
  WorkOrderStatus,
  WorkOrderPriority,
  IssueStatus,
  DamageCategory,
  DamageSeverity,
  ImageType,
} from "@prisma/client"

describe("Phase 7: Issue Lifecycle & Work Order Dispatch Integration Tests", () => {
  let superAdminToken: string
  let deptAdminToken: string
  let inspectorToken: string
  let citizenToken: string

  let citizenUserId: string
  let inspectorUserId: string

  let highwaysDeptId: string
  let publicWorksDeptId: string

  let testIssueId: string
  let testIssueReportNumber: string

  let createdWorkOrderId: string

  beforeAll(async () => {
    // 1. Fetch departments
    const highways = await prisma.department.findFirst({
      where: { name: { contains: "Highways" } },
    })
    const publicWorks = await prisma.department.findFirst({
      where: { name: { contains: "Public Works" } },
    })
    highwaysDeptId = highways!.id
    publicWorksDeptId = publicWorks!.id

    // 2. Log in users
    const adminRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@roadguard.local", password: "Password123!" })
    superAdminToken = adminRes.body.data.token

    const deptRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "highways.chief@roadguard.local", password: "Password123!" })
    deptAdminToken = deptRes.body.data.token

    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token
    inspectorUserId = inspectorRes.body.data.user.id

    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
    citizenUserId = citizenRes.body.data.user.id

    // 3. Create a test road issue in Highways Department
    const issue = await prisma.roadIssue.create({
      data: {
        reportNumber: `RG-WO-${Math.floor(1000 + Math.random() * 9000)}`,
        title: "Severely Eroded Trench across Trafalgar Square",
        description: "Heavy bus traffic causing roadbed subsidence.",
        damageCategory: DamageCategory.DEPRESSION,
        damageSeverity: DamageSeverity.CRITICAL,
        latitude: 51.508,
        longitude: -0.128,
        address: "Trafalgar Square South, London",
        departmentId: highwaysDeptId,
        reportedById: citizenUserId,
        status: IssueStatus.VERIFIED, // Already verified by inspector
      },
    })
    testIssueId = issue.id
    testIssueReportNumber = issue.reportNumber
  })

  afterAll(async () => {
    try {
      await prisma.workOrder.deleteMany({
        where: { issueId: testIssueId },
      })
      await prisma.roadIssue.deleteMany({
        where: { id: testIssueId },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Work Order Dispatch & Role Enforcement (POST /api/v1/work-orders)", () => {
    it("Allows Department Admin to dispatch a work order and automatically transitions issue to ASSIGNED", async () => {
      const scheduledDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString()

      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          issueId: testIssueId,
          departmentId: highwaysDeptId,
          assignedToId: inspectorUserId,
          workDescription: "Deploy rapid cold-milling and asphalt compaction crew.",
          priority: WorkOrderPriority.HIGH,
          scheduledDate,
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.workOrder).toBeDefined()

      const wo = res.body.data.workOrder
      createdWorkOrderId = wo.id
      expect(wo.issueId).toBe(testIssueId)
      expect(wo.departmentId).toBe(highwaysDeptId)
      expect(wo.assignedToId).toBe(inspectorUserId)
      expect(wo.priority).toBe(WorkOrderPriority.HIGH)
      expect(wo.status).toBe(WorkOrderStatus.SCHEDULED)

      // Verify road issue status automatically updated to ASSIGNED
      const updatedIssue = await prisma.roadIssue.findUnique({
        where: { id: testIssueId },
      })
      expect(updatedIssue!.status).toBe(IssueStatus.ASSIGNED)

      // Verify status history audit entry was recorded
      const history = await prisma.statusHistory.findFirst({
        where: {
          issueId: testIssueId,
          newStatus: IssueStatus.ASSIGNED,
        },
        orderBy: { createdAt: "desc" },
      })
      expect(history).toBeDefined()
      expect(history!.remarks).toContain("Work order dispatched")

      // Verify notification for reporting citizen
      const citizenNotification = await prisma.notification.findFirst({
        where: {
          userId: citizenUserId,
          title: { contains: testIssueReportNumber },
        },
        orderBy: { createdAt: "desc" },
      })
      expect(citizenNotification).toBeDefined()
      expect(citizenNotification!.message).toContain("dispatched")

      // Verify notification for assigned crew
      const crewNotification = await prisma.notification.findFirst({
        where: {
          userId: inspectorUserId,
          title: { contains: testIssueReportNumber },
        },
        orderBy: { createdAt: "desc" },
      })
      expect(crewNotification).toBeDefined()
      expect(crewNotification!.message).toContain("assigned")
    })

    it("Denies Citizen from creating or dispatching work orders (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          issueId: testIssueId,
          workDescription: "Citizen unauthorized dispatch attempt",
          priority: WorkOrderPriority.LOW,
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Denies Inspector from creating work orders (Admin-only privilege, 403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Authorization", `Bearer ${inspectorToken}`)
        .send({
          issueId: testIssueId,
          workDescription: "Inspector unauthorized dispatch attempt",
          priority: WorkOrderPriority.MEDIUM,
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Blocks Department Admin from dispatching work orders for another department (403 Forbidden)", async () => {
      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          issueId: testIssueId,
          departmentId: publicWorksDeptId, // Mismatched department
          workDescription: "Tampering across departmental boundaries",
          priority: WorkOrderPriority.EMERGENCY,
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("another municipal department")
    })

    it("Returns 404 Not Found when issueId does not exist", async () => {
      const res = await request(app)
        .post("/api/v1/work-orders")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({
          issueId: "00000000-0000-0000-0000-000000000000",
          departmentId: highwaysDeptId,
          workDescription: "Valid description for ghost issue",
        })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("2. List Work Orders (GET /api/v1/work-orders)", () => {
    it("Lists work orders with pagination and filtering", async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders?issueId=${testIssueId}`)
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.workOrders)).toBe(true)
      expect(res.body.data.workOrders.length).toBeGreaterThan(0)
      expect(res.body.data.workOrders[0].id).toBe(createdWorkOrderId)
    })

    it("Filters work orders by status", async () => {
      const res = await request(app)
        .get("/api/v1/work-orders?status=SCHEDULED")
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const allScheduled = res.body.data.workOrders.every(
        (wo: any) => wo.status === "SCHEDULED",
      )
      expect(allScheduled).toBe(true)
    })
  })

  describe("3. Get Work Order by ID (GET /api/v1/work-orders/:id)", () => {
    it("Retrieves work order by UUID with relational details", async () => {
      const res = await request(app)
        .get(`/api/v1/work-orders/${createdWorkOrderId}`)
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.workOrder.id).toBe(createdWorkOrderId)
      expect(res.body.data.workOrder.department).toBeDefined()
      expect(res.body.data.workOrder.issue).toBeDefined()
      expect(res.body.data.workOrder.assignedTo).toBeDefined()
    })

    it("Returns 404 Not Found for non-existent work order ID", async () => {
      const res = await request(app)
        .get("/api/v1/work-orders/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${deptAdminToken}`)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("4. Defect Repair Lifecycle Transitions (PATCH /api/v1/work-orders/:id/status)", () => {
    it("Advances work order to IN_PROGRESS and automatically advances road issue to IN_PROGRESS", async () => {
      const res = await request(app)
        .patch(`/api/v1/work-orders/${createdWorkOrderId}/status`)
        .set("Authorization", `Bearer ${inspectorToken}`) // Assigned crew member
        .send({
          status: WorkOrderStatus.IN_PROGRESS,
          notes: "Crew arrived on-site at Trafalgar Square; lane diversion active.",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.workOrder.status).toBe(WorkOrderStatus.IN_PROGRESS)

      // Verify road issue status updated to IN_PROGRESS
      const issue = await prisma.roadIssue.findUnique({
        where: { id: testIssueId },
      })
      expect(issue!.status).toBe(IssueStatus.IN_PROGRESS)

      // Verify notification generated for citizen
      const citizenNotification = await prisma.notification.findFirst({
        where: {
          userId: citizenUserId,
          title: { contains: "Repair In Progress" },
        },
        orderBy: { createdAt: "desc" },
      })
      expect(citizenNotification).toBeDefined()
      expect(citizenNotification!.message).toContain("commenced")
    })

    it("Advances work order to COMPLETED with repair evidence image, advancing road issue to REPAIR_COMPLETED", async () => {
      const repairEvidenceUrl =
        "https://res.cloudinary.com/roadguard/image/upload/v1/evidence/repaired_trench.jpg"

      const res = await request(app)
        .patch(`/api/v1/work-orders/${createdWorkOrderId}/status`)
        .set("Authorization", `Bearer ${deptAdminToken}`)
        .send({
          status: WorkOrderStatus.COMPLETED,
          notes: "Hot-mix asphalt laid and compacted with vibrating roller. Smooth flush finish.",
          repairEvidenceUrl,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.workOrder.status).toBe(WorkOrderStatus.COMPLETED)
      expect(res.body.data.workOrder.completedDate).toBeDefined()

      // Verify road issue status advanced to REPAIR_COMPLETED
      const issue = await prisma.roadIssue.findUnique({
        where: { id: testIssueId },
      })
      expect(issue!.status).toBe(IssueStatus.REPAIR_COMPLETED)

      // Verify repair after image was recorded
      const image = await prisma.issueImage.findFirst({
        where: {
          issueId: testIssueId,
          imageType: ImageType.REPAIR_AFTER,
        },
      })
      expect(image).toBeDefined()
      expect(image!.imageUrl).toBe(repairEvidenceUrl)

      // Verify final notification for citizen
      const citizenNotification = await prisma.notification.findFirst({
        where: {
          userId: citizenUserId,
          title: { contains: "Repairs Completed" },
        },
        orderBy: { createdAt: "desc" },
      })
      expect(citizenNotification).toBeDefined()
      expect(citizenNotification!.message).toContain("Repairs have been completed")
    })

    it("Denies an unauthorized citizen from updating work order status (403 Forbidden)", async () => {
      const res = await request(app)
        .patch(`/api/v1/work-orders/${createdWorkOrderId}/status`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
          status: WorkOrderStatus.CANCELLED,
        })

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })
})

