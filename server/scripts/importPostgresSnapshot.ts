/**
 * RoadGuard AI — Non-Destructive SQLite Snapshot -> Render PostgreSQL Importer
 * Usage:
 *   DATABASE_URL="postgresql://..." npm run db:import:postgres
 *
 * Guarantees:
 * - Never resets or deletes existing PostgreSQL data.
 * - Switches Prisma datasource temporarily to PostgreSQL, generates client, runs safe `db push`.
 * - Executes relational import in a clean subprocess so freshly generated PostgreSQL PrismaClient is loaded.
 * - Restores local `prisma/schema.prisma` afterward so git working tree stays clean.
 */

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env") })

const serverDir = path.resolve(__dirname, "..")
const schemaPath = path.resolve(serverDir, "prisma/schema.prisma")
const snapshotPath = path.resolve(serverDir, "prisma/backups/sqlite-snapshot-latest.json")

async function main() {
  const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL || ""

  if (!targetUrl.startsWith("postgres://") && !targetUrl.startsWith("postgresql://")) {
    console.error("❌ Error: A valid PostgreSQL connection string is required in DATABASE_URL or TARGET_DATABASE_URL.")
    console.error("   Example (PowerShell): $env:DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'; npm run db:import:postgres")
    process.exit(1)
  }

  if (!fs.existsSync(snapshotPath)) {
    console.error(`❌ Snapshot not found at: ${snapshotPath}`)
    console.error("   Run 'npm run db:export:sqlite' first to generate a verified backup & JSON snapshot.")
    process.exit(1)
  }

  const originalSchema = fs.readFileSync(schemaPath, "utf-8")
  const execEnv = { ...process.env, DATABASE_URL: targetUrl }

  try {
    console.log("---------------------------------------------------------------")
    console.log("🚀 RoadGuard Non-Destructive PostgreSQL Migration")
    console.log("---------------------------------------------------------------")

    const pgSchema = originalSchema.replace(
      /datasource\s+db\s+\{\s+provider\s*=\s*"[^"]+"\s+url\s*=\s*env\("DATABASE_URL"\)\s+\}/m,
      'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}',
    )
    fs.writeFileSync(schemaPath, pgSchema, "utf-8")

    console.log("[PG-MIGRATE] Generating PostgreSQL Prisma Client...")
    execSync("npx prisma generate", { stdio: "inherit", cwd: serverDir, env: execEnv })

    console.log("[PG-MIGRATE] Applying non-destructive schema push (`prisma db push`)...")
    execSync("npx prisma db push --skip-generate", { stdio: "inherit", cwd: serverDir, env: execEnv })

    console.log("[PG-MIGRATE] Importing snapshot records in clean subprocess...")
    execSync("npx tsx scripts/importPostgresWorker.ts", { stdio: "inherit", cwd: serverDir, env: execEnv })
  } finally {
    // Restore original schema & regenerate local sqlite client if local schema was sqlite
    if (originalSchema.includes('provider = "sqlite"')) {
      fs.writeFileSync(schemaPath, originalSchema, "utf-8")
      try {
        execSync("npx prisma generate", {
          stdio: "ignore",
          cwd: serverDir,
          env: { ...process.env, DATABASE_URL: "file:./roadguard.db" },
        })
      } catch {
        // Ignore cleanup warning
      }
    }
  }
}

main().catch((err) => {
  console.error("❌ PostgreSQL migration failed:", err?.message || err)
  process.exit(1)
})
