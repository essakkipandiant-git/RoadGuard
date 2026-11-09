import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting RoadGuard database seed...")

  const defaultPasswordHash = await bcrypt.hash("Password123!", 10)

  // 1. Seed Municipal Departments
  console.log("   Seeding departments...")
  const highwaysDept = await prisma.department.upsert({
    where: { name: "Highways & Road Infrastructure Department" },
    update: {},
    create: {
      name: "Highways & Road Infrastructure Department",
      description: "Responsible for asphalt resurfacing, road structural integrity, and arterial corridors.",
      contactEmail: "highways@roadguard.local",
      isActive: true,
    },
  })

  const publicWorksDept = await prisma.department.upsert({
    where: { name: "Public Works & Urban Drainage Division" },
    update: {},
    create: {
      name: "Public Works & Urban Drainage Division",
      description: "Manages subsurface subsidence, drainage culverts, and street utilities.",
      contactEmail: "publicworks@roadguard.local",
      isActive: true,
    },
  })

  const trafficDept = await prisma.department.upsert({
    where: { name: "Municipal Traffic & Safety Operations" },
    update: {},
    create: {
      name: "Municipal Traffic & Safety Operations",
      description: "Coordinates traffic diversions, pedestrian crossings, and rapid incident response.",
      contactEmail: "traffic@roadguard.local",
      isActive: true,
    },
  })

  // 2. Seed Wards
  console.log("   Seeding municipal wards...")
  const ward1 = await prisma.ward.upsert({
    where: { wardCode: "WARD-01" },
    update: {},
    create: {
      wardCode: "WARD-01",
      name: "Central Downtown District",
      city: "London",
      departmentId: highwaysDept.id,
      isActive: true,
    },
  })

  const ward2 = await prisma.ward.upsert({
    where: { wardCode: "WARD-02" },
    update: {},
    create: {
      wardCode: "WARD-02",
      name: "North Commercial Corridor",
      city: "London",
      departmentId: publicWorksDept.id,
      isActive: true,
    },
  })

  const ward3 = await prisma.ward.upsert({
    where: { wardCode: "WARD-03" },
    update: {},
    create: {
      wardCode: "WARD-03",
      name: "Harbour & Maritime Sector",
      city: "London",
      departmentId: highwaysDept.id,
      isActive: true,
    },
  })

  const ward4 = await prisma.ward.upsert({
    where: { wardCode: "WARD-04" },
    update: {},
    create: {
      wardCode: "WARD-04",
      name: "Eastern Residential Sector",
      city: "London",
      departmentId: trafficDept.id,
      isActive: true,
    },
  })

  // 3. Seed Users across all 4 roles
  console.log("   Seeding user accounts...")
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@roadguard.local" },
    update: {},
    create: {
      email: "admin@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "System Administrator",
      role: "SUPER_ADMIN",
      phoneNumber: "+44 20 7946 0900",
      isActive: true,
      emailVerified: true,
    },
  })

  const deptAdmin = await prisma.user.upsert({
    where: { email: "highways.chief@roadguard.local" },
    update: {
      departmentId: highwaysDept.id,
    },
    create: {
      email: "highways.chief@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "District Operations Chief",
      role: "DEPARTMENT_ADMIN",
      departmentId: highwaysDept.id,
      phoneNumber: "+44 20 7946 0901",
      isActive: true,
      emailVerified: true,
    },
  })

  const inspector = await prisma.user.upsert({
    where: { email: "inspector.sarah@roadguard.local" },
    update: {
      departmentId: highwaysDept.id,
    },
    create: {
      email: "inspector.sarah@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "Senior Inspector Sarah Chen",
      role: "INSPECTOR",
      departmentId: highwaysDept.id,
      phoneNumber: "+44 20 7946 0902",
      isActive: true,
      emailVerified: true,
    },
  })

  const citizen = await prisma.user.upsert({
    where: { email: "citizen.test@roadguard.local" },
    update: {},
    create: {
      email: "citizen.test@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "Elena Vance (Citizen Alliance)",
      role: "CITIZEN",
      phoneNumber: "+44 7700 900142",
      isActive: true,
      emailVerified: true,
    },
  })

  // 4. Seed Development Issues with Images & Status History
  console.log("   Seeding initial road issues...")
  const issue1 = await prisma.roadIssue.upsert({
    where: { reportNumber: "RG-10492" },
    update: {},
    create: {
      reportNumber: "RG-10492",
      title: "Critical Pothole Cavity",
      description: "Severe asphalt cavity on active bike corridor near bus stop, continuous water pooling during rain.",
      damageCategory: "CAVITY",
      damageSeverity: "CRITICAL",
      depth: 62.0,
      latitude: 51.5082,
      longitude: -0.1245,
      address: "Harbour Ave near Pier 4, London",
      wardId: ward3.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      status: "REPORTED",
      riskScore: 89,
      images: {
        create: [
          {
            imageUrl: "/images/detection_asphalt.jpg",
            imageType: "ORIGINAL_REPORT",
          },
          {
            imageUrl: "/images/detection_asphalt.jpg",
            imageType: "AI_ANNOTATED",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            previousStatus: null,
            newStatus: "REPORTED",
            changedById: citizen.id,
            remarks: "Report filed by citizen with GPS coordinates.",
          },
        ],
      },
    },
  })

  const issue2 = await prisma.roadIssue.upsert({
    where: { reportNumber: "RG-28190" },
    update: {},
    create: {
      reportNumber: "RG-28190",
      title: "Surface Web Cracking",
      description: "Longitudinal structural wear expanding across 1.4m of lane near school crossing.",
      damageCategory: "CRACK",
      damageSeverity: "HIGH",
      depth: 24.0,
      latitude: 51.5061,
      longitude: -0.131,
      address: "Mason Street, Junction 9, London",
      wardId: ward1.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      status: "IN_PROGRESS",
      riskScore: 68,
      images: {
        create: [
          {
            imageUrl: "/images/hero_road.jpg",
            imageType: "ORIGINAL_REPORT",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            previousStatus: null,
            newStatus: "REPORTED",
            changedById: citizen.id,
            remarks: "Report logged.",
          },
          {
            previousStatus: "REPORTED",
            newStatus: "UNDER_REVIEW",
            changedById: inspector.id,
            remarks: "Severity validated. Structural water ingress confirmed.",
          },
          {
            previousStatus: "UNDER_REVIEW",
            newStatus: "ASSIGNED",
            changedById: deptAdmin.id,
            remarks: "Assigned to Municipal Asphalt Crew 4.",
          },
          {
            previousStatus: "ASSIGNED",
            newStatus: "IN_PROGRESS",
            changedById: deptAdmin.id,
            remarks: "Traffic cones deployed. Crack mill & seal operation underway.",
          },
        ],
      },
      workOrders: {
        create: [
          {
            departmentId: highwaysDept.id,
            workDescription: "Crack mill and seal operation",
            priority: "HIGH",
            status: "IN_PROGRESS",
          },
        ],
      },
    },
  })

  const issue3 = await prisma.roadIssue.upsert({
    where: { reportNumber: "RG-39104" },
    update: {},
    create: {
      reportNumber: "RG-39104",
      title: "Edge Failure & Pavement Subsidence",
      description: "Restored and sealed with zero surface irregularities remaining.",
      damageCategory: "EDGE",
      damageSeverity: "LOW",
      depth: 18.0,
      latitude: 51.512,
      longitude: -0.119,
      address: "North Loop near Kingsway, London",
      wardId: ward2.id,
      departmentId: publicWorksDept.id,
      reportedById: citizen.id,
      status: "REPAIR_COMPLETED",
      riskScore: 12,
      images: {
        create: [
          {
            imageUrl: "/images/detection_asphalt.jpg",
            imageType: "ORIGINAL_REPORT",
          },
          {
            imageUrl: "/images/repaired_road.jpg",
            imageType: "REPAIR_AFTER",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            previousStatus: null,
            newStatus: "REPORTED",
            changedById: citizen.id,
            remarks: "Initial defect reported.",
          },
          {
            previousStatus: "REPORTED",
            newStatus: "REPAIR_COMPLETED",
            changedById: inspector.id,
            remarks: "Resurfacing finished and verified.",
          },
        ],
      },
    },
  })

  const issue4 = await prisma.roadIssue.upsert({
    where: { reportNumber: "RG-49201" },
    update: {},
    create: {
      reportNumber: "RG-49201",
      title: "High-Speed Lane Depression",
      description: "Severe cavity on high-volume corridor (610 vehicles/hour) within 110m of hospital route.",
      damageCategory: "CAVITY",
      damageSeverity: "CRITICAL",
      depth: 74.0,
      latitude: 51.5034,
      longitude: -0.1288,
      address: "Willow Road Arterial Junction, London",
      wardId: ward4.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      status: "UNDER_REVIEW",
      riskScore: 93,
      images: {
        create: [
          {
            imageUrl: "/images/detection_asphalt.jpg",
            imageType: "ORIGINAL_REPORT",
          },
        ],
      },
      statusHistory: {
        create: [
          {
            previousStatus: null,
            newStatus: "REPORTED",
            changedById: citizen.id,
            remarks: "Emergency telemetry report logged.",
          },
          {
            previousStatus: "REPORTED",
            newStatus: "UNDER_REVIEW",
            changedById: inspector.id,
            remarks: "Escalated to priority 1 review queue.",
          },
        ],
      },
    },
  })

  // 5. Seed Initial Audit Log
  await prisma.auditLog.create({
    data: {
      userId: superAdmin.id,
      action: "DATABASE_INITIALIZED",
      entityType: "System",
      details: JSON.stringify({
        departmentsCount: 3,
        wardsCount: 4,
        usersCount: 4,
        issuesCount: 4,
      }),
      ipAddress: "127.0.0.1",
    },
  })

  console.log("✅ Seed completed successfully:")
  console.log(`   - 3 Departments created`)
  console.log(`   - 4 Wards created`)
  console.log(`   - 4 Users created (default password: Password123!)`)
  console.log(`     * Admin:      admin@roadguard.local`)
  console.log(`     * Dept Chief: highways.chief@roadguard.local`)
  console.log(`     * Inspector:  inspector.sarah@roadguard.local`)
  console.log(`     * Citizen:    citizen.test@roadguard.local`)
  console.log(`   - 4 Sample Road Issues initialized`)
}

main()
  .catch((e) => {
    console.error("❌ Error during database seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

