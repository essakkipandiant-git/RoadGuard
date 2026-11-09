import { describe, it, expect, afterAll } from "vitest"
import request from "supertest"
import { app } from "../src/app"
import { prisma } from "../src/config/prisma"

describe("Phase 3: Authentication & Session Integration Tests", () => {
  const testCitizenEmail = `citizen.test.${Date.now()}@example.com`
  const testPassword = "Password123!"
  const newPassword = "NewSecretPassword456!"
  let citizenCookie: string

  afterAll(async () => {
    // Clean up test user
    try {
      await prisma.user.deleteMany({
        where: { email: { contains: "@example.com" } },
      })
    } catch {}
    await prisma.$disconnect()
  })

  describe("1. Citizen Registration (POST /api/v1/auth/register)", () => {
    it("Successfully registers a citizen and returns user with HTTP-only cookie", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Marcus Aurelius",
          email: testCitizenEmail,
          password: testPassword,
          phoneNumber: "+44 7700 900888",
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.user).toBeDefined()
      expect(res.body.data.user.email).toBe(testCitizenEmail)
      expect(res.body.data.user.role).toBe("CITIZEN")
      expect(res.body.data.user.passwordHash).toBeUndefined() // Plaintext/hash never leaked

      // Verify HTTP-only cookie
      const cookies = res.headers["set-cookie"]
      expect(cookies).toBeDefined()
      expect(cookies[0]).toContain("token=")
      expect(cookies[0]).toContain("HttpOnly")
    })

    it("Rejects duplicate email registration with 409 Conflict", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Imposter User",
          email: testCitizenEmail,
          password: testPassword,
        })

      expect(res.status).toBe(409)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("CONFLICT")
      expect(res.body.error.message).toContain("already exists")
    })

    it("Rejects weak password with 400 Validation Error", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Weak Password User",
          email: `weak.${Date.now()}@example.com`,
          password: "weak",
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("Prevents Privilege Escalation: Public registration forces CITIZEN role", async () => {
      const privilegedAttemptEmail = `hacker.${Date.now()}@example.com`
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          fullName: "Privilege Escalation Attempt",
          email: privilegedAttemptEmail,
          password: testPassword,
          role: "SUPER_ADMIN", // Malicious attempt to self-assign Super Admin
        })

      expect(res.status).toBe(201)
      expect(res.body.data.user.role).toBe("CITIZEN") // Role forced to CITIZEN

      // Verify in DB directly
      const dbUser = await prisma.user.findUnique({
        where: { email: privilegedAttemptEmail },
      })
      expect(dbUser?.role).toBe("CITIZEN")
    })
  })

  describe("2. User Login (POST /api/v1/auth/login)", () => {
    it("Logs in seeded Administrator with valid credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "admin@roadguard.local",
          password: "Password123!",
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.user.role).toBe("SUPER_ADMIN")
      expect(res.headers["set-cookie"]).toBeDefined()
    })

    it("Logs in newly registered citizen and extracts session cookie", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testCitizenEmail,
          password: testPassword,
        })

      expect(res.status).toBe(200)
      expect(res.body.data.user.email).toBe(testCitizenEmail)
      citizenCookie = res.headers["set-cookie"][0]
    })

    it("Rejects incorrect password with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testCitizenEmail,
          password: "WrongPassword999!",
        })

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
      expect(res.body.error.message).toBe("Invalid email or password")
    })

    it("Rejects non-existent email with identical 401 message (no user enumeration)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent.account@example.com",
          password: "Password123!",
        })

      expect(res.status).toBe(401)
      expect(res.body.error.message).toBe("Invalid email or password")
    })
  })

  describe("3. Profile & Session Verification (GET /api/v1/auth/me)", () => {
    it("Retrieves profile when authenticated via session cookie", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", citizenCookie)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.user.email).toBe(testCitizenEmail)
      expect(res.body.data.user.role).toBe("CITIZEN")
    })

    it("Rejects unauthenticated profile access with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/auth/me")

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })

  describe("4. Password Change (POST /api/v1/auth/change-password)", () => {
    it("Rejects password change when current password is wrong", async () => {
      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("Cookie", citizenCookie)
        .send({
          currentPassword: "IncorrectPassword123!",
          newPassword: newPassword,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("Current password is incorrect")
    })

    it("Changes password successfully with valid current password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/change-password")
        .set("Cookie", citizenCookie)
        .send({
          currentPassword: testPassword,
          newPassword: newPassword,
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toContain("updated successfully")

      // Subsequent login with old password must fail
      const oldLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testCitizenEmail,
          password: testPassword,
        })
      expect(oldLogin.status).toBe(401)

      // Subsequent login with new password must succeed
      const newLogin = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testCitizenEmail,
          password: newPassword,
        })
      expect(newLogin.status).toBe(200)
      citizenCookie = newLogin.headers["set-cookie"][0]
    })
  })

  describe("5. Logout (POST /api/v1/auth/logout)", () => {
    it("Clears the session cookie on logout", async () => {
      const res = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", citizenCookie)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toContain("Logged out")

      const cookies = res.headers["set-cookie"]
      expect(cookies[0]).toMatch(/token=;|token=deleted/i)
    })
  })
})

