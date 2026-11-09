import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"
import { ImageType, Role, DamageCategory, DamageSeverity } from "@prisma/client"
import fs from "fs"
import path from "path"
import { env } from "../src/config/env"
import bcrypt from "bcryptjs"

describe("Phase 6: Cloudinary Image Storage & Multipart Upload Tests", () => {
  let citizenToken: string
  let citizenUserId: string
  let otherCitizenToken: string
  let inspectorToken: string

  let testIssueId: string
  let testIssueImageId: string
  let uploadedLocalFiles: string[] = []

  // Valid 1x1 pixel image buffers for testing
  const dummyJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0xff, 0xd9,
  ])

  const dummyPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ])

  const dummyWebpBuffer = Buffer.from("RIFF....WEBPVP8 ......")

  beforeAll(async () => {
    // 1. Log in seeded citizen
    const citizenRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "citizen.test@roadguard.local", password: "Password123!" })
    citizenToken = citizenRes.body.data.token
    citizenUserId = citizenRes.body.data.user.id

    // 2. Create another citizen to test cross-citizen image deletion isolation
    const pwHash = await bcrypt.hash("Password123!", 10)
    const otherCitizen = await prisma.user.upsert({
      where: { email: "other.citizen.img@roadguard.local" },
      update: {},
      create: {
        email: "other.citizen.img@roadguard.local",
        passwordHash: pwHash,
        fullName: "Other Citizen Img",
        role: Role.CITIZEN,
        isActive: true,
      },
    })
    const otherRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "other.citizen.img@roadguard.local", password: "Password123!" })
    otherCitizenToken = otherRes.body.data.token

    // 3. Log in seeded inspector
    const inspectorRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "inspector.sarah@roadguard.local", password: "Password123!" })
    inspectorToken = inspectorRes.body.data.token

    // 4. Create a test road issue owned by citizenUserId
    const issue = await prisma.roadIssue.create({
      data: {
        reportNumber: `RG-IMG-${Math.floor(1000 + Math.random() * 9000)}`,
        title: "Phase 6 Image Test Defect",
        damageCategory: DamageCategory.CAVITY,
        damageSeverity: DamageSeverity.HIGH,
        latitude: 51.52,
        longitude: -0.11,
        address: "77 Image Storage Way, London",
        reportedById: citizenUserId,
      },
    })
    testIssueId = issue.id
  })

  afterAll(async () => {
    // Clean up created entities
    try {
      await prisma.roadIssue.deleteMany({
        where: { id: testIssueId },
      })
      await prisma.user.deleteMany({
        where: { email: "other.citizen.img@roadguard.local" },
      })
    } catch {}

    // Clean up any test files in uploads directory
    const uploadDir = path.resolve(env.UPLOAD_DIR)
    if (fs.existsSync(uploadDir)) {
      try {
        const files = await fs.promises.readdir(uploadDir)
        for (const file of files) {
          if (file.startsWith("img_")) {
            await fs.promises.unlink(path.join(uploadDir, file))
          }
        }
      } catch {}
    }

    await prisma.$disconnect()
  })

  describe("1. General Image Upload Endpoint (POST /api/v1/uploads/image)", () => {
    it("Successfully uploads a valid JPEG image and returns secure URL and publicId", async () => {
      const res = await request(app)
        .post("/api/v1/uploads/image")
        .set("Authorization", `Bearer ${citizenToken}`)
        .attach("image", dummyJpgBuffer, "pothole.jpg")

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeDefined()
      expect(res.body.data.imageUrl).toBeDefined()
      expect(res.body.data.publicId).toBeDefined()
      expect(res.body.data.bytes).toBeGreaterThan(0)
    })

    it("Successfully uploads a valid PNG image using the 'photo' field name", async () => {
      const res = await request(app)
        .post("/api/v1/uploads/image")
        .set("Authorization", `Bearer ${citizenToken}`)
        .attach("photo", dummyPngBuffer, "crack_defect.png")

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.imageUrl).toBeDefined()
    })

    it("Rejects unauthenticated upload requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/uploads/image")
        .attach("image", dummyJpgBuffer, "unauthorized.jpg")

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("Rejects disallowed MIME types (e.g. text/plain, PDF, executable) with 400 Bad Request", async () => {
      const badBuffer = Buffer.from("Malicious script content or invalid text")
      const res = await request(app)
        .post("/api/v1/uploads/image")
        .set("Authorization", `Bearer ${citizenToken}`)
        .attach("image", badBuffer, "payload.txt")

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toContain("Invalid file type")
    })

    it("Rejects request when no file is attached", async () => {
      const res = await request(app)
        .post("/api/v1/uploads/image")
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.message).toContain("Please select an image file")
    })
  })

  describe("2. Attach Image to Issue (POST /api/v1/issues/:id/images)", () => {
    it("Allows citizen owner to attach an image to their road defect report", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/images`)
        .set("Authorization", `Bearer ${citizenToken}`)
        .field("imageType", ImageType.ORIGINAL_REPORT)
        .attach("image", dummyJpgBuffer, "initial_report.jpg")

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.image).toBeDefined()

      const img = res.body.data.image
      testIssueImageId = img.id
      expect(img.issueId).toBe(testIssueId)
      expect(img.imageType).toBe(ImageType.ORIGINAL_REPORT)
      expect(img.imageUrl).toBeDefined()

      // Verify persisted in SQLite
      const dbImg = await prisma.issueImage.findUnique({
        where: { id: img.id },
      })
      expect(dbImg).toBeDefined()
    })

    it("Allows Inspector to attach INSPECTION_EVIDENCE image to any citizen's issue", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/images`)
        .set("Authorization", `Bearer ${inspectorToken}`)
        .field("imageType", ImageType.INSPECTION_EVIDENCE)
        .attach("image", dummyPngBuffer, "inspector_depth_caliper.png")

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.image.imageType).toBe(ImageType.INSPECTION_EVIDENCE)
    })

    it("Denies another citizen from attaching images to a report they do not own (403 Forbidden)", async () => {
      const res = await request(app)
        .post(`/api/v1/issues/${testIssueId}/images`)
        .set("Authorization", `Bearer ${otherCitizenToken}`)
        .attach("image", dummyJpgBuffer, "tamper.jpg")

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(res.body.error.message).toContain("another citizen's report")
    })

    it("Returns 404 Not Found when attaching image to a non-existent issue", async () => {
      const res = await request(app)
        .post("/api/v1/issues/non-existent-uuid/images")
        .set("Authorization", `Bearer ${citizenToken}`)
        .attach("image", dummyJpgBuffer, "ghost.jpg")

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("3. Remove Image from Issue (DELETE /api/v1/issues/:id/images/:imageId)", () => {
    it("Denies an unauthorized citizen from deleting someone else's image (403 Forbidden)", async () => {
      const res = await request(app)
        .delete(`/api/v1/issues/${testIssueId}/images/${testIssueImageId}`)
        .set("Authorization", `Bearer ${otherCitizenToken}`)

      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("Allows the issue owner to delete their attached image", async () => {
      const res = await request(app)
        .delete(`/api/v1/issues/${testIssueId}/images/${testIssueImageId}`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toContain("successfully deleted")

      // Verify removed from database
      const dbImg = await prisma.issueImage.findUnique({
        where: { id: testIssueImageId },
      })
      expect(dbImg).toBeNull()
    })

    it("Returns 404 Not Found when deleting an image that does not exist", async () => {
      const res = await request(app)
        .delete(`/api/v1/issues/${testIssueId}/images/non-existent-image-id`)
        .set("Authorization", `Bearer ${citizenToken}`)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })
})

