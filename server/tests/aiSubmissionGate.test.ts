import { describe, expect, it, beforeEach, beforeAll } from "vitest"
import {
  AiDetectionService,
  MIN_DEFECT_CONFIDENCE_THRESHOLD,
  InspectionVerificationPayload,
} from "../src/services/aiDetectionService"
import { IssueService } from "../src/services/issueService"
import { prisma } from "../src/config/prisma"
import { Role, DamageCategory, DamageSeverity } from "@prisma/client"
import { BadRequestError } from "../src/utils/errors"
import crypto from "crypto"

describe("Part B: Strict AI Image Submission Gate & 60% Confidence Threshold Tests", () => {
  let citizenUser: any
  let validWard: any
  let validDept: any

  beforeEach(() => {
    AiDetectionService.resetAnalysisRegistryForTests()
  })

  beforeAll(async () => {
    validWard = await prisma.ward.findFirst()
    validDept = await prisma.department.findFirst()

    citizenUser = await prisma.user.findFirst({ where: { role: Role.CITIZEN } })
    if (!citizenUser) {
      citizenUser = await prisma.user.create({
        data: {
          email: "citizen_ai_gate@roadguard.in",
          fullName: "Citizen Gate Tester",
          passwordHash: "hash123",
          role: Role.CITIZEN,
        },
      })
    }
  })

  const createBaseInput = () => ({
    title: "AI Gate Verification Road Defect",
    description: "Deep cavity on asphalt surface",
    damageCategory: DamageCategory.CAVITY,
    damageSeverity: DamageSeverity.HIGH,
    latitude: 19.076,
    longitude: 72.8777,
    address: "Bandra Kurla Complex, Mumbai",
    roadClass: "arterial" as const,
    wardId: validWard?.id,
    departmentId: validDept?.id,
    photoUrl: "https://res.cloudinary.com/xkvdkmry/image/upload/v1/roadguard/pothole_verified.jpg",
    forceDuplicate: true,
  })

  describe("1. Confidence Threshold & Status Verification", () => {
    it("centrally configures the minimum confidence threshold to 0.60 (60%)", () => {
      expect(MIN_DEFECT_CONFIDENCE_THRESHOLD).toBe(0.60)
    })

    it("Test 1: Pothole with confidence 0.85 -> PASS (detected status, submission allowed)", async () => {
      const imageHash = crypto.createHash("sha256").update("pothole_sample_085").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "detected",
        highestConfidence: 0.85,
        detectedClasses: ["cavity"],
        detectionsCount: 1,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      const res = await IssueService.createIssue(
        citizenUser.id,
        {
          ...createBaseInput(),
          aiVerificationToken: token,
          imageHash,
        },
        Role.CITIZEN,
      )

      expect(res.issue).toBeDefined()
      expect(res.issue.title).toBe("AI Gate Verification Road Defect")
    })

    it("Test 2: Pothole with confidence 0.65 -> PASS (>= 0.60 threshold)", async () => {
      const imageHash = crypto.createHash("sha256").update("pothole_sample_065").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "detected",
        highestConfidence: 0.65,
        detectedClasses: ["cavity"],
        detectionsCount: 1,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      const res = await IssueService.createIssue(
        citizenUser.id,
        {
          ...createBaseInput(),
          aiVerificationToken: token,
          imageHash,
        },
        Role.CITIZEN,
      )

      expect(res.issue).toBeDefined()
    })

    it("Test 3: Pothole with confidence 0.59 -> BLOCK (below 0.60 threshold)", async () => {
      const imageHash = crypto.createHash("sha256").update("pothole_sample_059").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "low_confidence",
        highestConfidence: 0.59,
        detectedClasses: ["cavity"],
        detectionsCount: 1,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(BadRequestError)
    })

    it("Test 4: Fashion photograph -> BLOCK (unrelated_image rejected)", async () => {
      const imageHash = crypto.createHash("sha256").update("fashion_outfit_image").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "unrelated_image",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/unrelated_image|failed automated inspection/i)
    })

    it("Test 5: Animal photograph -> BLOCK (unrelated_image rejected)", async () => {
      const imageHash = crypto.createHash("sha256").update("dog_pet_photograph").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "unrelated_image",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/unrelated_image|failed automated inspection/i)
    })

    it("Test 6: Clean road -> BLOCK (no_damage_found rejected)", async () => {
      const imageHash = crypto.createHash("sha256").update("clean_smooth_asphalt").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "no_damage_found",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/no_damage_found|failed automated inspection/i)
    })

    it("Test 7: Blurry photograph -> BLOCK (blurry_image rejected)", async () => {
      const imageHash = crypto.createHash("sha256").update("blurry_out_of_focus").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "blurry_image",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/blurry_image|failed automated inspection/i)
    })

    it("Test 8: AI service unavailable -> BLOCK (ai_unavailable rejected)", async () => {
      const imageHash = crypto.createHash("sha256").update("service_offline_image").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "ai_unavailable",
        highestConfidence: 0,
        detectedClasses: [],
        detectionsCount: 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/ai_unavailable|failed automated inspection/i)
    })
  })

  describe("2. Security Anti-Bypass & Cryptographic Integrity Tests", () => {
    it("Test 9: Replaced image with stale passing result -> BLOCK (hash mismatch)", async () => {
      const originalHash = crypto.createHash("sha256").update("image_A_passing").digest("hex")
      const replacedHash = crypto.createHash("sha256").update("image_B_different").digest("hex")

      // Token belongs to image A
      const tokenA = AiDetectionService.generateVerificationToken({
        imageHash: originalHash,
        status: "detected",
        highestConfidence: 0.92,
        detectedClasses: ["cavity"],
        detectionsCount: 1,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      // Client submits with replaced image B
      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: tokenA,
            imageHash: replacedHash, // Mismatched hash!
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/does not match the submitted photograph|token reuse blocked/i)
    })

    it("Test 10: Client attempts to forge 99% confidence -> BLOCK (forged token signature mismatch)", async () => {
      const imageHash = crypto.createHash("sha256").update("fashion_photo_trying_bypass").digest("hex")

      // Attacker constructs a fake token with 99% confidence without the server's private secret
      const fakePayload: InspectionVerificationPayload = {
        imageHash,
        status: "detected",
        highestConfidence: 0.99,
        detectedClasses: ["cavity"],
        detectionsCount: 1,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      }
      const fakeData = Buffer.from(JSON.stringify(fakePayload)).toString("base64url")
      const fakeSignature = "invalid_forged_hmac_signature_value"
      const forgedToken = `${fakeData}.${fakeSignature}`

      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: forgedToken,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/signature mismatch|tampering detected/i)
    })

    it("Test 11: Valid inference record reused for a different image -> BLOCK (single-use consumption)", async () => {
      const imageHash = crypto.createHash("sha256").update("single_use_passing_image").digest("hex")
      const token = AiDetectionService.generateVerificationToken({
        imageHash,
        status: "detected",
        highestConfidence: 0.88,
        detectedClasses: ["cavity"],
        detectionsCount: 1,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      })

      // First submission with valid token succeeds
      const firstRes = await IssueService.createIssue(
        citizenUser.id,
        {
          ...createBaseInput(),
          aiVerificationToken: token,
          imageHash,
        },
        Role.CITIZEN,
      )
      expect(firstRes.issue).toBeDefined()

      // Second attempt to reuse the exact same token must be BLOCKED
      await expect(
        IssueService.createIssue(
          citizenUser.id,
          {
            ...createBaseInput(),
            aiVerificationToken: token,
            imageHash,
          },
          Role.CITIZEN,
        ),
      ).rejects.toThrow(/already been consumed/i)
    })
  })
})

