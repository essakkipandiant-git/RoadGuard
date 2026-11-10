import { describe, it, expect, afterAll } from "vitest"
import { prisma } from "../src/config/prisma"
import bcrypt from "bcryptjs"

describe("Phase 2: SQLite & Prisma Database Verification", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("Database connection is healthy and responsive", async () => {
    const departmentsCount = await prisma.department.count()
    expect(departmentsCount).toBeGreaterThanOrEqual(3)
  })

  it("All 9 core database entities are present and queryable", async () => {
    const usersCount = await prisma.user.count()
    const deptCount = await prisma.department.count()
    const wardsCount = await prisma.ward.count()
    const issuesCount = await prisma.roadIssue.count()
    const imagesCount = await prisma.issueImage.count()
    const historyCount = await prisma.statusHistory.count()
    const workOrdersCount = await prisma.workOrder.count()
    const auditLogsCount = await prisma.auditLog.count()
    const notificationsCount = await prisma.notification.count()

    expect(usersCount).toBeGreaterThanOrEqual(4)
    expect(deptCount).toBeGreaterThanOrEqual(3)
    expect(wardsCount).toBeGreaterThanOrEqual(4)
    expect(issuesCount).toBeGreaterThanOrEqual(4)
    expect(imagesCount).toBeGreaterThanOrEqual(5)
    expect(historyCount).toBeGreaterThanOrEqual(9)
    expect(workOrdersCount).toBeGreaterThanOrEqual(1)
    expect(auditLogsCount).toBeGreaterThanOrEqual(1)
    expect(notificationsCount).toBeGreaterThanOrEqual(0)
  })

  it("Users have correct roles and valid bcrypt password hashes", async () => {
    const admin = await prisma.user.findUnique({
      where: { email: "admin@roadguard.local" },
    })
    expect(admin).toBeDefined()
    expect(admin?.role).toBe("SUPER_ADMIN")
    expect(admin?.fullName).toBe("System Administrator")

    const passwordMatch = await bcrypt.compare("Password123!", admin!.passwordHash)
    expect(passwordMatch).toBe(true)

    const chief = await prisma.user.findUnique({
      where: { email: "highways.chief@roadguard.local" },
    })
    expect(chief?.role).toBe("DEPARTMENT_ADMIN")

    const inspector = await prisma.user.findUnique({
      where: { email: "inspector.sarah@roadguard.local" },
    })
    expect(inspector?.role).toBe("INSPECTOR")

    const citizen = await prisma.user.findUnique({
      where: { email: "citizen.test@roadguard.local" },
    })
    expect(citizen?.role).toBe("CITIZEN")
  })

  it("Relational integrity: RoadIssue relations populate correctly", async () => {
    const issue = await prisma.roadIssue.findUnique({
      where: { reportNumber: "RG-10492" },
      include: {
        ward: true,
        department: true,
        reportedBy: true,
        images: true,
        statusHistory: true,
      },
    })

    expect(issue).toBeDefined()
    expect(issue?.title).toContain("Cavity")
    expect(issue?.ward?.wardCode).toBeDefined()
    expect(issue?.department?.name).toContain("Highways")
    expect(issue?.reportedBy?.email).toBe("citizen.test@roadguard.local")
    expect(issue?.images.length).toBeGreaterThanOrEqual(2)
    expect(issue?.statusHistory.length).toBeGreaterThanOrEqual(1)
  })

  it("Cascade Deletion Rule: Deleting an issue cascades to its images", async () => {
    // Create temporary test issue
    const tempIssue = await prisma.roadIssue.create({
      data: {
        reportNumber: `RG-TEST-${Date.now()}`,
        title: "Temporary Test Issue for Cascade",
        latitude: 51.5,
        longitude: -0.1,
        address: "Test Cascade Street",
        images: {
          create: [
            {
              imageUrl: "/images/test.jpg",
              imageType: "ORIGINAL_REPORT",
            },
          ],
        },
      },
      include: {
        images: true,
      },
    })

    const tempImageId = tempIssue.images[0].id

    // Verify image exists
    const imageBefore = await prisma.issueImage.findUnique({
      where: { id: tempImageId },
    })
    expect(imageBefore).toBeDefined()

    // Delete issue
    await prisma.roadIssue.delete({
      where: { id: tempIssue.id },
    })

    // Image must be cascade-deleted
    const imageAfter = await prisma.issueImage.findUnique({
      where: { id: tempImageId },
    })
    expect(imageAfter).toBeNull()
  })
})

