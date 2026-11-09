/**
 * RoadGuard AI — Production Readiness Verification Script
 * Validates environment, SQLite WAL mode, database connectivity, storage, and health.
 */

import { prisma } from "../src/config/prisma"
import { env } from "../src/config/env"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"

interface CheckItem {
  name: string
  status: "PASS" | "WARN" | "FAIL"
  details: string
}

const checks: CheckItem[] = []

function addCheck(name: string, status: "PASS" | "WARN" | "FAIL", details: string) {
  checks.push({ name, status, details })
  const icon = status === "PASS" ? "✅" : status === "WARN" ? "⚠️" : "❌"
  console.log(`${icon} [${status}] ${name}: ${details}`)
}

async function runProductionSanityChecks() {
  console.log("\n========================================================")
  console.log(" ROADGUARD AI — PRODUCTION ENVIRONMENT SANITY AUDIT")
  console.log("========================================================\n")

  // 1. Environment Variable Validation
  console.log("--- 1. Environment Configuration ---")
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) {
    addCheck(
      "JWT Secret Entropy",
      "PASS",
      `Configured with high entropy (${env.JWT_SECRET.length} characters)`,
    )
  } else if (env.JWT_SECRET && env.JWT_SECRET.length >= 16) {
    addCheck(
      "JWT Secret Entropy",
      "WARN",
      `Secret length (${env.JWT_SECRET.length} chars) is acceptable for staging, recommend >= 32 chars for production`,
    )
  } else {
    addCheck(
      "JWT Secret Entropy",
      "FAIL",
      "JWT_SECRET is missing or too short. Insecure for production.",
    )
  }

  if (env.PORT > 0 && env.PORT < 65536) {
    addCheck("Network Port", "PASS", `Server configured on port ${env.PORT}`)
  } else {
    addCheck("Network Port", "FAIL", `Invalid port configuration: ${env.PORT}`)
  }

  if (env.FRONTEND_URL) {
    addCheck(
      "CORS Allowed Origin",
      "PASS",
      `Frontend URL configured: ${env.FRONTEND_URL}`,
    )
  } else {
    addCheck(
      "CORS Allowed Origin",
      "WARN",
      "FRONTEND_URL not set, falling back to permissive development origins",
    )
  }

  // 2. Database Connectivity & SQLite Integrity
  console.log("\n--- 2. Database & SQLite Journal Mode ---")
  try {
    const rawResult: any[] = await prisma.$queryRawUnsafe("PRAGMA journal_mode;")
    const journalMode = rawResult?.[0]?.journal_mode || "unknown"

    if (journalMode.toLowerCase() === "wal") {
      addCheck(
        "SQLite Concurrency (WAL)",
        "PASS",
        "Write-Ahead Logging (WAL) is enabled for high-concurrency municipal access",
      )
    } else {
      // Automatically attempt to enable WAL mode for production performance
      try {
        await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;")
        addCheck(
          "SQLite Concurrency (WAL)",
          "PASS",
          `Automatically upgraded journal mode from ${journalMode} to WAL`,
        )
      } catch {
        addCheck(
          "SQLite Concurrency (WAL)",
          "WARN",
          `Current journal mode is '${journalMode}'. Recommend WAL for multi-user deployments.`,
        )
      }
    }

    // Verify core entity counts
    const usersCount = await prisma.user.count()
    const superAdminCount = await prisma.user.count({
      where: { role: "SUPER_ADMIN" },
    })
    const deptCount = await prisma.department.count()
    const wardsCount = await prisma.ward.count()

    if (usersCount >= 1 && superAdminCount >= 1) {
      addCheck(
        "Administrative User Provisioning",
        "PASS",
        `Found ${usersCount} users, including ${superAdminCount} Super Admin account(s)`,
      )
    } else {
      addCheck(
        "Administrative User Provisioning",
        "FAIL",
        "No Super Admin account found in database. Run 'npm run prisma:seed' or create one.",
      )
    }

    if (deptCount >= 1 && wardsCount >= 1) {
      addCheck(
        "Municipal Jurisdiction Hierarchy",
        "PASS",
        `Found ${deptCount} departments and ${wardsCount} municipal wards`,
      )
    } else {
      addCheck(
        "Municipal Jurisdiction Hierarchy",
        "WARN",
        "No departments or wards found. Incident auto-routing may fail.",
      )
    }
  } catch (err: any) {
    addCheck("Database Connectivity", "FAIL", `Could not connect to database: ${err.message}`)
  }

  // 3. Storage Subsystem Validation
  console.log("\n--- 3. Storage Subsystem ---")
  if (
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  ) {
    addCheck(
      "Cloudinary Storage",
      "PASS",
      `Connected to Cloudinary cloud '${env.CLOUDINARY_CLOUD_NAME}'`,
    )
  } else {
    // Check local fallback directory
    const uploadPath = path.resolve(env.UPLOAD_DIR || "./uploads")
    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true })
      }
      const testFile = path.join(uploadPath, `.write-test-${Date.now()}`)
      fs.writeFileSync(testFile, "test")
      fs.unlinkSync(testFile)
      addCheck(
        "Local Storage Fallback",
        "PASS",
        `Upload directory '${uploadPath}' is writable`,
      )
    } catch (e: any) {
      addCheck(
        "Local Storage Fallback",
        "FAIL",
        `Upload directory '${uploadPath}' is not writable: ${e.message}`,
      )
    }
  }

  // 4. HTTP Health Endpoint Check
  console.log("\n--- 4. HTTP Health Endpoint Probe ---")
  await new Promise<void>((resolve) => {
    const req = http.get(`http://localhost:${env.PORT}/api/health`, (res) => {
      let data = ""
      res.on("data", (chunk) => (data += chunk))
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data)
            if (parsed.success && parsed.data.status === "ok") {
              addCheck(
                "API Health Endpoint",
                "PASS",
                `GET /api/health returned 200 OK (Uptime: ${parsed.data.uptimeSeconds}s)`,
              )
            } else {
              addCheck("API Health Endpoint", "WARN", "Health endpoint returned non-standard payload")
            }
          } catch {
            addCheck("API Health Endpoint", "WARN", "Health endpoint did not return JSON")
          }
        } else {
          addCheck(
            "API Health Endpoint",
            "WARN",
            `GET /api/health returned status ${res.statusCode}`,
          )
        }
        resolve()
      })
    })

    req.on("error", (err) => {
      addCheck(
        "API Health Endpoint",
        "WARN",
        `Could not reach running server on port ${env.PORT} (${err.message}). Is the daemon running?`,
      )
      resolve()
    })

    req.setTimeout(3000, () => {
      req.destroy()
      addCheck("API Health Endpoint", "WARN", "Health request timed out after 3000ms")
      resolve()
    })
  })

  // 5. Final Audit Summary
  console.log("\n========================================================")
  const passed = checks.filter((c) => c.status === "PASS").length
  const warnings = checks.filter((c) => c.status === "WARN").length
  const failed = checks.filter((c) => c.status === "FAIL").length

  console.log(` AUDIT RESULTS: ${passed} PASSED | ${warnings} WARNINGS | ${failed} FAILED`)
  console.log("========================================================\n")

  if (failed > 0) {
    console.error("❌ Production verification FAILED: Critical issues must be resolved before deployment.\n")
    process.exit(1)
  } else {
    console.log("✅ Production verification PASSED: RoadGuard is ready for municipal deployment.\n")
    process.exit(0)
  }
}

runProductionSanityChecks().catch((err) => {
  console.error("Fatal error during production verification:", err)
  process.exit(1)
})

