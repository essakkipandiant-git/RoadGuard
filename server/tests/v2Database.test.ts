import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "../src/config/prisma"
import { Role, IssueStatus, DamageCategory, DamageSeverity, CommunityUpdateType, VerificationStatus, CommunityPostCategory, ApprovalActionType } from "@prisma/client"

describe("Phase B: V2 Database Schema Expansion, Models & Relationship Checks", () => {
  let testCitizenId: string
  let testFieldAdminId: string
  let testDeptAdminId: string
  let testIssueId: string

  beforeAll(async () => {
    // 1. Fetch or create test users
    const citizen = await prisma.user.upsert({
      where: { email: "citizen.v2test@roadguard.local" },
      update: {},
      create: {
        email: "citizen.v2test@roadguard.local",
        passwordHash: "testHash123",
        fullName: "Test Citizen V2",
        role: Role.CITIZEN,
      },
    })
    testCitizenId = citizen.id

    const fieldAdmin = await prisma.user.upsert({
      where: { email: "fieldadmin.v2test@roadguard.local" },
      update: { role: Role.FIELD_ADMIN },
      create: {
        email: "fieldadmin.v2test@roadguard.local",
        passwordHash: "testHash123",
        fullName: "Field Admin Rajesh Patil",
        role: Role.FIELD_ADMIN,
      },
    })
    testFieldAdminId = fieldAdmin.id

    const deptAdmin = await prisma.user.upsert({
      where: { email: "deptadmin.v2test@roadguard.local" },
      update: { role: Role.DEPARTMENT_ADMIN },
      create: {
        email: "deptadmin.v2test@roadguard.local",
        passwordHash: "testHash123",
        fullName: "Chief Dept Admin Kulkarni",
        role: Role.DEPARTMENT_ADMIN,
      },
    })
    testDeptAdminId = deptAdmin.id

    // 2. Create a test RoadIssue with V2 fields
    const issue = await prisma.roadIssue.create({
      data: {
        reportNumber: `RG-TEST-${Date.now().toString().slice(-5)}`,
        title: "Test Deep Cavity on Marine Drive",
        description: "Severe cavity on road surface near Marine Drive promenade",
        damageCategory: DamageCategory.CAVITY,
        damageSeverity: DamageSeverity.CRITICAL,
        depth: 85,
        latitude: 18.9438,
        longitude: 72.8232,
        address: "Marine Drive, Ward D, Mumbai",
        status: IssueStatus.REPORTED,
        riskScore: 88,
        confirmationsCount: 1,
        isDemo: true,
        assignedInspectorId: testFieldAdminId,
        governmentReferenceId: "BMC-2026-OCT-88912",
        governmentPortalUrl: "https://portal.mcgm.gov.in/complaints/BMC-2026-OCT-88912",
        officialDepartmentName: "Highways & Road Infrastructure Department",
        officialContactInfo: "+91 22 2262 0251",
        externalStatus: "ACKNOWLEDGED_BY_WARD_OFFICE",
      },
    })
    testIssueId = issue.id
  })

  afterAll(async () => {
    // Clean up test entities created in this test suite
    if (testIssueId) {
      await prisma.roadIssue.delete({ where: { id: testIssueId } }).catch(() => {})
    }
    await prisma.user.deleteMany({
      where: {
        email: { in: ["citizen.v2test@roadguard.local", "fieldadmin.v2test@roadguard.local", "deptadmin.v2test@roadguard.local"] },
      },
    }).catch(() => {})
    await prisma.geographicBoundary.deleteMany({
      where: { code: "MCGM-TEST-MUMBAI" },
    }).catch(() => {})
  })

  // 1. Existing data preservation check
  it("TC-B01: Preserves existing baseline tables and records without data loss", async () => {
    const userCount = await prisma.user.count()
    const issueCount = await prisma.roadIssue.count()
    const deptCount = await prisma.department.count()
    const wardCount = await prisma.ward.count()

    expect(userCount).toBeGreaterThanOrEqual(4)
    expect(issueCount).toBeGreaterThanOrEqual(1)
    expect(deptCount).toBeGreaterThanOrEqual(3)
    expect(wardCount).toBeGreaterThanOrEqual(4)
  })

  // 2. Role standardization & FIELD_ADMIN verification
  it("TC-B02: Standardizes user roles including FIELD_ADMIN, CITIZEN, DEPARTMENT_ADMIN, SUPER_ADMIN", async () => {
    const fieldAdmin = await prisma.user.findUnique({
      where: { id: testFieldAdminId },
    })
    expect(fieldAdmin).not.toBeNull()
    expect(fieldAdmin?.role).toBe(Role.FIELD_ADMIN)
    expect(fieldAdmin?.role).toBe("FIELD_ADMIN")
  })

  // 3. RoadIssue V2 fields and assignment relationship
  it("TC-B03: RoadIssue correctly persists V2 fields (isDemo, governmentReferenceId, assignedInspector)", async () => {
    const fetchedIssue = await prisma.roadIssue.findUnique({
      where: { id: testIssueId },
      include: { assignedInspector: true },
    })

    expect(fetchedIssue).not.toBeNull()
    expect(fetchedIssue?.isDemo).toBe(true)
    expect(fetchedIssue?.governmentReferenceId).toBe("BMC-2026-OCT-88912")
    expect(fetchedIssue?.governmentPortalUrl).toContain("mcgm.gov.in")
    expect(fetchedIssue?.officialDepartmentName).toBe("Highways & Road Infrastructure Department")
    expect(fetchedIssue?.assignedInspector?.id).toBe(testFieldAdminId)
    expect(fetchedIssue?.assignedInspector?.fullName).toBe("Field Admin Rajesh Patil")
  })

  // 4. IssueCommunityUpdate model & verification workflow
  it("TC-B04: Creates IssueCommunityUpdate with PENDING verification status (does NOT change issue status)", async () => {
    const communityUpdate = await prisma.issueCommunityUpdate.create({
      data: {
        issueId: testIssueId,
        userId: testCitizenId,
        authorName: "Test Citizen V2",
        updateType: CommunityUpdateType.APPEARS_REPAIRED,
        description: "I visited the site this morning and the cavity appears to be filled with bitumen asphalt.",
        photos: JSON.stringify(["https://res.cloudinary.com/roadguard/image/upload/v2_repair_evidence.jpg"]),
        latitude: 18.9439,
        longitude: 72.8233,
        verificationStatus: VerificationStatus.PENDING,
      },
    })

    expect(communityUpdate.id).toBeDefined()
    expect(communityUpdate.updateType).toBe("APPEARS_REPAIRED")
    expect(communityUpdate.verificationStatus).toBe("PENDING")
    expect(communityUpdate.verifiedAt).toBeNull()

    // Verify issue status remains unchanged (separation of duties!)
    const issue = await prisma.roadIssue.findUnique({ where: { id: testIssueId } })
    expect(issue?.status).toBe(IssueStatus.REPORTED)

    // Authorized field admin verifies the update
    const verifiedUpdate = await prisma.issueCommunityUpdate.update({
      where: { id: communityUpdate.id },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        adminRemarks: "On-site inspection confirmed repair quality matches municipal standards.",
        verifiedById: testFieldAdminId,
        verifiedAt: new Date(),
      },
      include: { verifiedBy: true },
    })

    expect(verifiedUpdate.verificationStatus).toBe("VERIFIED")
    expect(verifiedUpdate.verifiedBy?.id).toBe(testFieldAdminId)
  })

  // 5. CommunityPost and CommunityComment relationships
  it("TC-B05: Supports CommunityPost creation with categories, issue linkage, and nested comments", async () => {
    const post = await prisma.communityPost.create({
      data: {
        authorId: testCitizenId,
        authorName: "Test Citizen V2",
        authorRole: Role.CITIZEN,
        category: CommunityPostCategory.REPAIR_FEEDBACK,
        title: "Prompt repair on Marine Drive promenade",
        content: "Commending the Ward D maintenance squad for inspecting the severe cavity so quickly.",
        relatedIssueId: testIssueId,
        wardId: "WARD-D",
        locality: "Marine Drive",
      },
    })

    expect(post.id).toBeDefined()
    expect(post.category).toBe("REPAIR_FEEDBACK")
    expect(post.upvotesCount).toBe(0)

    // Staff replies with official badge
    const staffComment = await prisma.communityComment.create({
      data: {
        postId: post.id,
        authorId: testFieldAdminId,
        authorName: "Field Admin Rajesh Patil",
        authorRole: Role.FIELD_ADMIN,
        isOfficial: true,
        officialBadge: "MCGM Ward D Field Inspector",
        content: "Thank you for the update. Our crew completed asphalt compaction this afternoon.",
      },
    })

    expect(staffComment.id).toBeDefined()
    expect(staffComment.isOfficial).toBe(true)
    expect(staffComment.officialBadge).toBe("MCGM Ward D Field Inspector")

    // Citizen replies nested under staff comment
    const replyComment = await prisma.communityComment.create({
      data: {
        postId: post.id,
        parentId: staffComment.id,
        authorId: testCitizenId,
        authorName: "Test Citizen V2",
        authorRole: Role.CITIZEN,
        content: "Much appreciated! Smooth drive now.",
      },
    })

    expect(replyComment.parentId).toBe(staffComment.id)

    // Retrieve post with threaded comments
    const fetchedPost = await prisma.communityPost.findUnique({
      where: { id: post.id },
      include: {
        comments: {
          include: { replies: true },
        },
      },
    })

    expect(fetchedPost?.comments.length).toBe(2)
    const topLevelComment = fetchedPost?.comments.find((c) => c.parentId === null)
    expect(topLevelComment?.replies.length).toBe(1)
    expect(topLevelComment?.replies[0].id).toBe(replyComment.id)
  })

  // 6. CommunityReaction unique constraint
  it("TC-B06: Enforces unique reaction constraint per user per post", async () => {
    const post = await prisma.communityPost.create({
      data: {
        authorName: "Citizen Anonymous",
        title: "Pothole depth increasing after rain",
        content: "Water logging is worsening the asphalt erosion.",
      },
    })

    const reaction1 = await prisma.communityReaction.create({
      data: {
        postId: post.id,
        userId: testCitizenId,
        reactionType: "UPVOTE",
      },
    })
    expect(reaction1.id).toBeDefined()

    // Attempting to upvote twice from same user must fail unique constraint
    await expect(
      prisma.communityReaction.create({
        data: {
          postId: post.id,
          userId: testCitizenId,
          reactionType: "UPVOTE",
        },
      })
    ).rejects.toThrow()
  })

  // 7. CommunityPostReport moderation flagging
  it("TC-B07: Supports moderation reporting on community posts", async () => {
    const post = await prisma.communityPost.create({
      data: {
        authorName: "Spam Bot",
        title: "Buy cheap tires online now",
        content: "Visit spam-link-example.com for discounts.",
      },
    })

    const report = await prisma.communityPostReport.create({
      data: {
        postId: post.id,
        reportedById: testCitizenId,
        reason: "SPAM",
        details: "Promotional commercial advertising unrelated to road issues.",
      },
    })

    expect(report.status).toBe("PENDING")

    // Admin reviews report and moderates post
    const reviewedReport = await prisma.communityPostReport.update({
      where: { id: report.id },
      data: {
        status: "ACTIONED",
        reviewedById: testDeptAdminId,
        reviewedAt: new Date(),
      },
    })

    const moderatedPost = await prisma.communityPost.update({
      where: { id: post.id },
      data: {
        isModerated: true,
        moderationReason: "Post removed for violating community spam guidelines.",
      },
    })

    expect(reviewedReport.status).toBe("ACTIONED")
    expect(moderatedPost.isModerated).toBe(true)
  })

  // 8. ApprovalRecord immutable audit trail
  it("TC-B08: Records immutable approval history without overwriting prior records", async () => {
    // Record 1: Verification
    const approval1 = await prisma.approvalRecord.create({
      data: {
        issueId: testIssueId,
        actionType: ApprovalActionType.VERIFY_REPORT,
        previousStatus: IssueStatus.REPORTED,
        newStatus: IssueStatus.VERIFIED,
        reviewerId: testFieldAdminId,
        reviewerName: "Field Admin Rajesh Patil",
        reviewerRole: Role.FIELD_ADMIN,
        remarks: "Verified structural void 85mm depth. High hazard to 2-wheelers.",
        evidencePhotos: JSON.stringify(["https://res.cloudinary.com/roadguard/image/upload/field_check.jpg"]),
      },
    })

    // Record 2: Work Order Dispatch
    const approval2 = await prisma.approvalRecord.create({
      data: {
        issueId: testIssueId,
        actionType: ApprovalActionType.DISPATCH_WORK_ORDER,
        previousStatus: IssueStatus.VERIFIED,
        newStatus: IssueStatus.ASSIGNED,
        reviewerId: testDeptAdminId,
        reviewerName: "Chief Dept Admin Kulkarni",
        reviewerRole: Role.DEPARTMENT_ADMIN,
        remarks: "Dispatched hot-mix asphalt crew with 24hr SLA.",
      },
    })

    const history = await prisma.approvalRecord.findMany({
      where: { issueId: testIssueId },
      orderBy: { createdAt: "asc" },
    })

    expect(history.length).toBe(2)
    expect(history[0].id).toBe(approval1.id)
    expect(history[0].actionType).toBe("VERIFY_REPORT")
    expect(history[1].id).toBe(approval2.id)
    expect(history[1].actionType).toBe("DISPATCH_WORK_ORDER")
    // Previous record was NOT overwritten!
    expect(history[0].newStatus).toBe(IssueStatus.VERIFIED)
  })

  // 9. GeographicBoundary model for Mumbai limits
  it("TC-B09: Stores and queries Greater Mumbai GeographicBoundary with GeoJSON", async () => {
    const boundary = await prisma.geographicBoundary.create({
      data: {
        name: "Greater Mumbai Municipal Corporation (MCGM) Limits",
        boundaryType: "MUNICIPAL_LIMITS",
        code: "MCGM-TEST-MUMBAI",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        minLat: 18.89,
        maxLat: 19.32,
        minLng: 72.77,
        maxLng: 73.01,
        geoJson: JSON.stringify({
          type: "Polygon",
          coordinates: [
            [
              [72.77, 18.89],
              [73.01, 18.89],
              [73.01, 19.32],
              [72.77, 19.32],
              [72.77, 18.89],
            ],
          ],
        }),
      },
    })

    expect(boundary.id).toBeDefined()
    expect(boundary.code).toBe("MCGM-TEST-MUMBAI")
    expect(boundary.minLat).toBe(18.89)
    expect(boundary.maxLat).toBe(19.32)

    const parsedGeoJson = JSON.parse(boundary.geoJson)
    expect(parsedGeoJson.type).toBe("Polygon")
    expect(parsedGeoJson.coordinates[0].length).toBe(5)
  })

  // 10. NotificationPreference model
  it("TC-B10: Creates and manages citizen NotificationPreference", async () => {
    const preference = await prisma.notificationPreference.create({
      data: {
        userId: testCitizenId,
        emailAlerts: true,
        statusUpdates: true,
        communityReplies: true,
        nearbyHazardAlerts: true,
      },
    })

    expect(preference.userId).toBe(testCitizenId)
    expect(preference.nearbyHazardAlerts).toBe(true)

    const userWithPref = await prisma.user.findUnique({
      where: { id: testCitizenId },
      include: { notificationPreference: true },
    })

    expect(userWithPref?.notificationPreference?.id).toBe(preference.id)
  })
})

