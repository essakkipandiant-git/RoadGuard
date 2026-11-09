import { describe, it, expect } from "vitest"
import request from "supertest"
import { app } from "../src/app"

describe("Phase 1: Backend Setup, Health & Middleware Tests", () => {
  it("GET /api/health returns 200 OK with healthy system status", async () => {
    const res = await request(app).get("/api/health")

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(res.body.data.status).toBe("ok")
    expect(res.body.data.service).toBe("roadguard-api")
    expect(typeof res.body.data.uptimeSeconds).toBe("number")
    expect(typeof res.body.data.timestamp).toBe("string")
  })

  it("GET /api/invalid-route returns 404 with structured JSON error", async () => {
    const res = await request(app).get("/api/invalid-route-xyz")

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeDefined()
    expect(res.body.error.code).toBe("NOT_FOUND")
    expect(res.body.error.message).toContain("GET /api/invalid-route-xyz does not exist")
  })

  it("Security Headers: Helmet injects secure response headers", async () => {
    const res = await request(app).get("/api/health")

    expect(res.headers["x-content-type-options"]).toBe("nosniff")
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN")
    expect(res.headers["strict-transport-security"]).toBeDefined()
  })

  it("CORS: Blocks requests from unpermitted origins", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://malicious-site.com")

    // CORS middleware should block the origin with 500 / error
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error.message).toContain("CORS policy blocked access")
  })

  it("CORS: Allows requests from FRONTEND_URL", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:8443")

    expect(res.status).toBe(200)
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8443")
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
  })
})

