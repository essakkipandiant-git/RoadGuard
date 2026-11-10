import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding Greater Mumbai (MCGM) RoadGuard database...")

  const defaultPasswordHash = await bcrypt.hash("Password123!", 10)

  // 1. Seed Municipal Departments
  console.log("   Seeding Mumbai Municipal Departments...")
  const highwaysDept = await prisma.department.upsert({
    where: { name: "Highways & Road Infrastructure Department" },
    update: {
      description: "Responsible for VG-30 bitumen resurfacing, arterial corridor structural integrity, and flyover slip roads.",
      contactEmail: "highways@mcgm.roadguard.gov.in",
    },
    create: {
      name: "Highways & Road Infrastructure Department",
      description: "Responsible for VG-30 bitumen resurfacing, arterial corridor structural integrity, and flyover slip roads.",
      contactEmail: "highways@mcgm.roadguard.gov.in",
      isActive: true,
    },
  })

  const publicWorksDept = await prisma.department.upsert({
    where: { name: "Public Works & Urban Drainage Division" },
    update: {
      description: "Manages subsurface subsidence, stormwater culverts, and utility trench restorations across Greater Mumbai.",
      contactEmail: "pwd@mcgm.roadguard.gov.in",
    },
    create: {
      name: "Public Works & Urban Drainage Division",
      description: "Manages subsurface subsidence, stormwater culverts, and utility trench restorations across Greater Mumbai.",
      contactEmail: "pwd@mcgm.roadguard.gov.in",
      isActive: true,
    },
  })

  const trafficDept = await prisma.department.upsert({
    where: { name: "Mumbai Traffic Police & Safety Operations" },
    update: {
      description: "Coordinates traffic diversions, arterial lane closures, and rapid pothole hazard cordoning.",
      contactEmail: "traffic@mcgm.roadguard.gov.in",
    },
    create: {
      name: "Mumbai Traffic Police & Safety Operations",
      description: "Coordinates traffic diversions, arterial lane closures, and rapid pothole hazard cordoning.",
      contactEmail: "traffic@mcgm.roadguard.gov.in",
      isActive: true,
    },
  })

  // 2. Seed Greater Mumbai Wards
  console.log("   Seeding MCGM Municipal Wards...")
  const wardKE = await prisma.ward.upsert({
    where: { wardCode: "WARD-KE" },
    update: { name: "Ward K/E (Andheri East - WEH)", city: "Mumbai" },
    create: {
      wardCode: "WARD-KE",
      name: "Ward K/E (Andheri East - WEH)",
      city: "Mumbai",
      departmentId: highwaysDept.id,
      isActive: true,
    },
  })

  const wardHW = await prisma.ward.upsert({
    where: { wardCode: "WARD-HW" },
    update: { name: "Ward H/W (Bandra West & Linking Road)", city: "Mumbai" },
    create: {
      wardCode: "WARD-HW",
      name: "Ward H/W (Bandra West & Linking Road)",
      city: "Mumbai",
      departmentId: highwaysDept.id,
      isActive: true,
    },
  })

  const wardA = await prisma.ward.upsert({
    where: { wardCode: "WARD-A" },
    update: { name: "Ward A (Marine Drive & Colaba)", city: "Mumbai" },
    create: {
      wardCode: "WARD-A",
      name: "Ward A (Marine Drive & Colaba)",
      city: "Mumbai",
      departmentId: publicWorksDept.id,
      isActive: true,
    },
  })

  const wardGN = await prisma.ward.upsert({
    where: { wardCode: "WARD-GN" },
    update: { name: "Ward G/N (Dadar TT & Mahim)", city: "Mumbai" },
    create: {
      wardCode: "WARD-GN",
      name: "Ward G/N (Dadar TT & Mahim)",
      city: "Mumbai",
      departmentId: trafficDept.id,
      isActive: true,
    },
  })

  const wardL = await prisma.ward.upsert({
    where: { wardCode: "WARD-L" },
    update: { name: "Ward L (Kurla & BKC Connector)", city: "Mumbai" },
    create: {
      wardCode: "WARD-L",
      name: "Ward L (Kurla & BKC Connector)",
      city: "Mumbai",
      departmentId: highwaysDept.id,
      isActive: true,
    },
  })

  // 3. Seed Users across all 4 personas
  console.log("   Seeding official municipal user accounts...")
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@roadguard.local" },
    update: { fullName: "System Administrator", role: "SUPER_ADMIN" },
    create: {
      email: "admin@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "System Administrator",
      role: "SUPER_ADMIN",
      phoneNumber: "+91 22 2262 0251",
      isActive: true,
      emailVerified: true,
    },
  })

  const deptAdmin = await prisma.user.upsert({
    where: { email: "highways.chief@roadguard.local" },
    update: {
      fullName: "District Operations Chief",
      role: "DEPARTMENT_ADMIN",
      departmentId: highwaysDept.id,
    },
    create: {
      email: "highways.chief@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "District Operations Chief",
      role: "DEPARTMENT_ADMIN",
      departmentId: highwaysDept.id,
      phoneNumber: "+91 22 2262 0252",
      isActive: true,
      emailVerified: true,
    },
  })

  const inspector = await prisma.user.upsert({
    where: { email: "inspector.sarah@roadguard.local" },
    update: {
      fullName: "Senior Inspector Sarah Chen",
      role: "INSPECTOR",
      departmentId: highwaysDept.id,
    },
    create: {
      email: "inspector.sarah@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "Senior Inspector Sarah Chen",
      role: "INSPECTOR",
      departmentId: highwaysDept.id,
      phoneNumber: "+91 22 2262 0253",
      isActive: true,
      emailVerified: true,
    },
  })

  const citizen = await prisma.user.upsert({
    where: { email: "citizen.test@roadguard.local" },
    update: { fullName: "Elena Vance (Citizen Alliance)", role: "CITIZEN" },
    create: {
      email: "citizen.test@roadguard.local",
      passwordHash: defaultPasswordHash,
      fullName: "Elena Vance (Citizen Alliance)",
      role: "CITIZEN",
      phoneNumber: "+91 98200 12345",
      isActive: true,
      emailVerified: true,
    },
  })

  // Clean up duplicate test records if any
  console.log("   Cleaning up legacy duplicate test issues...")
  await prisma.roadIssue.deleteMany({
    where: {
      title: "Large Void Under Asphalt on City Road",
    },
  })

  // 4. Seed Diverse Greater Mumbai Issues Across All 5 Stages
  console.log("   Seeding balanced Greater Mumbai road hazards across all 5 stages...")

  const issuesSeedData = [
    // -------------------------------------------------------------
    // STAGE 1: INBOUND CITIZEN REPORTS (AI Edge Verified, Awaiting Dept Triage)
    // -------------------------------------------------------------
    {
      reportNumber: "RG-10492",
      title: "Deep Impact Cavity near Bandra Toll Plaza",
      description: "Severe asphalt cavity on active south-bound corridor near toll approach, causing sudden vehicle deflection.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "CRITICAL" as const,
      depth: 74.0,
      latitude: 19.0544,
      longitude: 72.8267,
      address: "Bandra-Worli Sea Link Approach, Bandra West, Mumbai",
      wardId: wardHW.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      status: "REPORTED" as const,
      riskScore: 92,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "AI_ANNOTATED" as const },
      ],
      remarks: "Report filed by citizen commuter. AI optical confidence 98.4%.",
    },
    {
      reportNumber: "RG-18302",
      title: "Bitumen Displacement along Marine Drive Promenade",
      description: "High-wear longitudinal cracking expanding near pedestrian promenade crossing.",
      damageCategory: "CRACK" as const,
      damageSeverity: "HIGH" as const,
      depth: 42.0,
      latitude: 18.9438,
      longitude: 72.8232,
      address: "Netaji Subhash Chandra Bose Road, Marine Drive, Mumbai",
      wardId: wardA.id,
      departmentId: publicWorksDept.id,
      reportedById: citizen.id,
      status: "REPORTED" as const,
      riskScore: 78,
      images: [
        { imageUrl: "/images/hero_road.jpg", imageType: "ORIGINAL_REPORT" as const },
      ],
      remarks: "Citizen observation verified via Edge CV.",
    },
    {
      reportNumber: "RG-20184",
      title: "Severe Longitudinal Trench at Dadar TT Circle",
      description: "Trench settlement adjacent to bus terminal lane creating heavy vibration for two-wheelers.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "CRITICAL" as const,
      depth: 68.0,
      latitude: 19.0178,
      longitude: 72.8478,
      address: "Dr. Babasaheb Ambedkar Road, Dadar TT Circle, Mumbai",
      wardId: wardGN.id,
      departmentId: trafficDept.id,
      reportedById: citizen.id,
      status: "REPORTED" as const,
      riskScore: 88,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
      ],
      remarks: "High-traffic corridor risk flagged.",
    },

    // -------------------------------------------------------------
    // STAGE 2: UNDER REVIEW / DEPT WORK ORDERS PENDING
    // -------------------------------------------------------------
    {
      reportNumber: "RG-49201",
      title: "Subsurface Subsidence on WEH Northbound Lane 2",
      description: "Severe cavity on high-volume Western Express corridor (610 vehicles/hour) within 110m of hospital flyover route.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "CRITICAL" as const,
      depth: 82.0,
      latitude: 19.1136,
      longitude: 72.8697,
      address: "Western Express Highway, Ward K/E, Andheri East, Mumbai",
      wardId: wardKE.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "UNDER_REVIEW" as const,
      riskScore: 94,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "AI_ANNOTATED" as const },
      ],
      remarks: "AI detection validated by Super Admin; routed to Highways Dept for crew dispatch.",
    },
    {
      reportNumber: "RG-51042",
      title: "Edge Erosion near SV Road Commercial Corridor",
      description: "Shoulder bitumen breakup expanding towards stormwater drain inlet.",
      damageCategory: "EDGE" as const,
      damageSeverity: "HIGH" as const,
      depth: 48.0,
      latitude: 19.0833,
      longitude: 72.8398,
      address: "Swami Vivekanand Road, Santacruz West, Mumbai",
      wardId: wardHW.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "UNDER_REVIEW" as const,
      riskScore: 76,
      images: [
        { imageUrl: "/images/hero_road.jpg", imageType: "ORIGINAL_REPORT" as const },
      ],
      remarks: "Field inspector assigned for engineering measurement.",
    },

    // -------------------------------------------------------------
    // STAGE 3: WORK ORDER DISPATCHED / FIELD CREW RESTORATION ACTIVE
    // -------------------------------------------------------------
    {
      reportNumber: "RG-28190",
      title: "Transverse Thermal Fracture near BKC Flyover Slip",
      description: "Milling and hot-mix asphalt operation currently underway by Municipal Hot-Mix Asphalt Crew 4.",
      damageCategory: "CRACK" as const,
      damageSeverity: "HIGH" as const,
      depth: 38.0,
      latitude: 19.0657,
      longitude: 72.8682,
      address: "BKC Connector, Bandra Kurla Complex, Mumbai",
      wardId: wardL.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "IN_PROGRESS" as const,
      riskScore: 71,
      images: [
        { imageUrl: "/images/hero_road.jpg", imageType: "ORIGINAL_REPORT" as const },
      ],
      remarks: "Traffic cones deployed. Hot-mix VG-30 laying in progress.",
    },
    {
      reportNumber: "RG-63201",
      title: "Asphalt Cavity on CST Road Kurla Arterial",
      description: "Work order #WO-MCGM-402 active. Field crew deployed with compactor roller.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "HIGH" as const,
      depth: 55.0,
      latitude: 19.0712,
      longitude: 72.8791,
      address: "CST Road, Kurla West, Mumbai",
      wardId: wardL.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "ASSIGNED" as const,
      riskScore: 68,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
      ],
      remarks: "Dispatched to Quick Response Contractor Crew 2.",
    },

    // -------------------------------------------------------------
    // STAGE 4: RESTORATION COMPLETED (EVIDENCE UPLOADED, PENDING DEPT AUDIT)
    // -------------------------------------------------------------
    {
      reportNumber: "RG-39104",
      title: "Depression on Linking Road Commercial Strip",
      description: "Resurfaced with VG-30 bitumen. Physical photo evidence submitted with matching GPS coordinates (delta 2.1m).",
      damageCategory: "CAVITY" as const,
      damageSeverity: "HIGH" as const,
      depth: 52.0,
      latitude: 19.0596,
      longitude: 72.8331,
      address: "Linking Road near Waterfield Road, Bandra West, Mumbai",
      wardId: wardHW.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "REPAIR_COMPLETED" as const,
      riskScore: 20,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/repaired_road.jpg", imageType: "REPAIR_AFTER" as const },
      ],
      remarks: "Field crew uploaded physical proof. Awaiting Department Head engineering audit.",
    },
    {
      reportNumber: "RG-77209",
      title: "Surface Cavity near Powai JVLR Corridor",
      description: "Milled and compacted with hot-mix asphalt. Post-repair photo uploaded for municipal sign-off.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "CRITICAL" as const,
      depth: 65.0,
      latitude: 19.1258,
      longitude: 72.9056,
      address: "Jogeshwari-Vikhroli Link Road, Powai, Mumbai",
      wardId: wardKE.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "REPAIR_COMPLETED" as const,
      riskScore: 18,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/repaired_road.jpg", imageType: "REPAIR_AFTER" as const },
      ],
      remarks: "Field evidence submitted with 99.8% GPS lock match.",
    },

    // -------------------------------------------------------------
    // STAGE 5: DEPT AUDIT APPROVED (AWAITING FINAL SUPER ADMIN EXECUTIVE SEAL)
    // -------------------------------------------------------------
    {
      reportNumber: "RG-81319",
      title: "Severe Subsidence near Sion Circle Flyover",
      description: "Dept Admin Marcus Brody completed on-site engineering audit and approved quality compliance.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "CRITICAL" as const,
      depth: 70.0,
      latitude: 19.0398,
      longitude: 72.8622,
      address: "Dr. Ambedkar Road, Sion Circle, Mumbai",
      wardId: wardGN.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "REPAIR_COMPLETED" as const,
      riskScore: 15,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/repaired_road.jpg", imageType: "REPAIR_AFTER" as const },
      ],
      remarks: "Dept Head approved quality audit; forwarded to Super Admin for Final Executive Seal.",
    },

    // -------------------------------------------------------------
    // STAGE 5: CERTIFIED REPAIRED & SAFE (Executive Seal Granted)
    // -------------------------------------------------------------
    {
      reportNumber: "RG-90214",
      title: "Restored Arterial Cavity at Colaba Causeway",
      description: "Permanently restored and certified by Super Admin executive sign-off. Road surface smooth and compliant.",
      damageCategory: "CAVITY" as const,
      damageSeverity: "LOW" as const,
      depth: 14.0,
      latitude: 18.9186,
      longitude: 72.8282,
      address: "Shahid Bhagat Singh Road, Colaba, Mumbai",
      wardId: wardA.id,
      departmentId: highwaysDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "CLOSED" as const,
      riskScore: 0,
      images: [
        { imageUrl: "/images/detection_asphalt.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/repaired_road.jpg", imageType: "REPAIR_AFTER" as const },
      ],
      remarks: "Executive Seal granted by Super Admin. Fully certified.",
    },
    {
      reportNumber: "RG-91500",
      title: "Resurfaced Lane near Marine Lines Flyover",
      description: "Milled and hot-mix resurfaced. Verified 100% surface match by municipal vision scanner.",
      damageCategory: "CRACK" as const,
      damageSeverity: "LOW" as const,
      depth: 12.0,
      latitude: 18.9442,
      longitude: 72.8258,
      address: "Maharshi Karve Road, Marine Lines, Mumbai",
      wardId: wardA.id,
      departmentId: publicWorksDept.id,
      reportedById: citizen.id,
      assignedInspectorId: inspector.id,
      status: "CLOSED" as const,
      riskScore: 0,
      images: [
        { imageUrl: "/images/hero_road.jpg", imageType: "ORIGINAL_REPORT" as const },
        { imageUrl: "/images/repaired_road.jpg", imageType: "REPAIR_AFTER" as const },
      ],
      remarks: "Tier 4 Executive Certificate issued. Case closed.",
    },
  ]

  for (const item of issuesSeedData) {
    const issue = await prisma.roadIssue.upsert({
      where: { reportNumber: item.reportNumber },
      update: {
        title: item.title,
        description: item.description,
        damageCategory: item.damageCategory,
        damageSeverity: item.damageSeverity,
        depth: item.depth,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        wardId: item.wardId,
        departmentId: item.departmentId,
        reportedById: item.reportedById,
        assignedInspectorId: item.assignedInspectorId || null,
        status: item.status,
        riskScore: item.riskScore,
      },
      create: {
        reportNumber: item.reportNumber,
        title: item.title,
        description: item.description,
        damageCategory: item.damageCategory,
        damageSeverity: item.damageSeverity,
        depth: item.depth,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        wardId: item.wardId,
        departmentId: item.departmentId,
        reportedById: item.reportedById,
        assignedInspectorId: item.assignedInspectorId || null,
        status: item.status,
        riskScore: item.riskScore,
      },
    })

    // Upsert images
    for (const img of item.images) {
      await prisma.issueImage.create({
        data: {
          issueId: issue.id,
          imageUrl: img.imageUrl,
          imageType: img.imageType,
        },
      })
    }

    // Upsert Initial Status History
    await prisma.statusHistory.create({
      data: {
        issueId: issue.id,
        previousStatus: null,
        newStatus: item.status,
        changedById: citizen.id,
        remarks: item.remarks,
      },
    })
  }

  // 5. Seed Initial Audit Log
  await prisma.auditLog.create({
    data: {
      userId: superAdmin.id,
      action: "DATABASE_INITIALIZED_MUMBAI",
      entityType: "System",
      details: JSON.stringify({
        departmentsCount: 3,
        wardsCount: 5,
        usersCount: 4,
        issuesCount: issuesSeedData.length,
      }),
      ipAddress: "127.0.0.1",
    },
  })

  console.log("✅ Greater Mumbai Seed completed successfully!")
  console.log(`   - 3 MCGM Departments`)
  console.log(`   - 5 Mumbai Wards (K/E, H/W, A, G/N, L)`)
  console.log(`   - 4 Role Accounts (admin, highways.chief, inspector.sarah, citizen.test)`)
  console.log(`   - ${issuesSeedData.length} Realistic Mumbai Road Defects across all 5 Stages`)
}

main()
  .catch((e) => {
    console.error("❌ Error during database seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
