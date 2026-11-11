/**
 * RoadGuard AI — Production Database Initializer & Migration Assistant
 * Automatically handles SQLite (local/volume) and PostgreSQL (Railway/cloud)
 * safely without destructive schema operations.
 */

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import dotenv from "dotenv"

// Load environment variables from server root
dotenv.config({ path: path.resolve(__dirname, "../.env") })

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./roadguard.db"
}

const databaseUrl = process.env.DATABASE_URL
const isPostgres = databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")
const schemaPath = path.resolve(__dirname, "../prisma/schema.prisma")
const serverDir = path.resolve(__dirname, "..")
const execEnv = { ...process.env, DATABASE_URL: databaseUrl }

console.log("---------------------------------------------------------------")
console.log("🏛️  RoadGuard Database Initializer")
console.log(`   Target Connection: ${isPostgres ? "PostgreSQL (Production Cloud)" : "SQLite (Local / Persistent File)"}`)
console.log("---------------------------------------------------------------")

function configurePrismaProvider() {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Prisma schema not found at: ${schemaPath}`)
  }

  let schemaContent = fs.readFileSync(schemaPath, "utf-8")
  const currentProvider = schemaContent.includes('provider = "postgresql"') ? "postgresql" : "sqlite"
  const targetProvider = isPostgres ? "postgresql" : "sqlite"

  if (currentProvider !== targetProvider) {
    console.log(`[DB-INIT] Updating Prisma datasource provider: ${currentProvider} -> ${targetProvider}`)
    schemaContent = schemaContent.replace(
      /datasource\s+db\s+\{\s+provider\s*=\s*"[^"]+"\s+url\s*=\s*env\("DATABASE_URL"\)\s+\}/m,
      `datasource db {\n  provider = "${targetProvider}"\n  url      = env("DATABASE_URL")\n}`,
    )
    fs.writeFileSync(schemaPath, schemaContent, "utf-8")
  } else {
    console.log(`[DB-INIT] Prisma schema datasource already configured for: ${targetProvider}`)
  }
}

async function runDatabaseSync() {
  try {
    configurePrismaProvider()

    console.log("[DB-INIT] Generating Prisma Client...")
    execSync("npx prisma generate", { stdio: "inherit", cwd: serverDir, env: execEnv })

    console.log("[DB-INIT] Synchronizing database schema...")
    // db push ensures all tables, enums, indexes, and relations are created safely without losing data
    execSync("npx prisma db push --skip-generate", { stdio: "inherit", cwd: serverDir, env: execEnv })

    // Dynamically require PrismaClient to verify database connectivity & seed if needed
    const { PrismaClient } = await import("@prisma/client")
    const prisma = new PrismaClient()

    try {
      const departmentCount = await prisma.department.count()
      console.log(`[DB-INIT] Connected successfully. Found ${departmentCount} municipal departments in database.`)

      if (departmentCount === 0) {
        console.log("[DB-INIT] Fresh database detected. Executing initial municipal seed...")
        execSync("npx tsx prisma/seed.ts", { stdio: "inherit", cwd: serverDir, env: execEnv })
        console.log("[DB-INIT] Initial seed completed successfully.")
      } else {
        console.log("[DB-INIT] Municipal data verified. Skipping duplicate seed.")
      }
    } finally {
      await prisma.$disconnect()
    }

    console.log("---------------------------------------------------------------")
    console.log("✅ RoadGuard Database is initialized and ready for production.")
    console.log("---------------------------------------------------------------")
  } catch (error: any) {
    console.error("❌ [DB-INIT] Database initialization encountered an error:", error.message || error)
    process.exit(1)
  }
}

runDatabaseSync()

