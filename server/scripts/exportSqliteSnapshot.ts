/**
 * RoadGuard AI — Safe SQLite Backup & Relational Snapshot Exporter
 * Performs WAL checkpoint, copies physical SQLite DB to server/prisma/backups/,
 * and exports all 17 Prisma models with record counts for non-destructive PostgreSQL migration.
 */

import fs from "fs"
import path from "path"
import { execSync } from "child_process"
import dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env") })

const serverDir = path.resolve(__dirname, "..")
const prismaDir = path.resolve(serverDir, "prisma")
const backupDir = path.resolve(prismaDir, "backups")
const schemaPath = path.resolve(prismaDir, "schema.prisma")
const sqliteDbPath = path.resolve(prismaDir, "roadguard.db")

async function exportSnapshot() {
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`❌ Source SQLite database not found at: ${sqliteDbPath}`)
    process.exit(1)
  }

  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")

  // Ensure schema provider is temporarily sqlite for local export if needed
  const schemaContent = fs.readFileSync(schemaPath, "utf-8")
  if (!schemaContent.includes('provider = "sqlite"')) {
    const updated = schemaContent.replace(
      /datasource\s+db\s+\{\s+provider\s*=\s*"[^"]+"\s+url\s*=\s*env\("DATABASE_URL"\)\s+\}/m,
      'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}',
    )
    fs.writeFileSync(schemaPath, updated, "utf-8")
    execSync("npx prisma generate", {
      stdio: "inherit",
      cwd: serverDir,
      env: { ...process.env, DATABASE_URL: "file:./roadguard.db" },
    })
  }

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient({
    datasources: { db: { url: "file:./roadguard.db" } },
  })

  try {
    // Merge WAL frames into main .db before binary backup copy
    try {
      await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);")
    } catch {
      // Ignore if database is not in WAL mode
    }

    const integrity: any[] = await prisma.$queryRawUnsafe("PRAGMA integrity_check;")
    const integrityStatus = integrity?.[0]?.integrity_check || "unknown"
    console.log(`[BACKUP] SQLite PRAGMA integrity_check: ${integrityStatus}`)

    const binaryBackupPath = path.resolve(backupDir, `roadguard-pre-render-${stamp}.db`)
    fs.copyFileSync(sqliteDbPath, binaryBackupPath)
    console.log(`[BACKUP] ✅ Binary SQLite backup created: ${binaryBackupPath} (${fs.statSync(binaryBackupPath).size} bytes)`)

    // Export all 17 models in parent -> child topological order
    const snapshot = {
      exportedAt: new Date().toISOString(),
      sourceDatabase: "sqlite (server/prisma/roadguard.db)",
      integrityCheck: integrityStatus,
      tables: {
        departments: await prisma.department.findMany(),
        wards: await prisma.ward.findMany(),
        users: await prisma.user.findMany(),
        notificationPreferences: await prisma.notificationPreference.findMany(),
        geographicBoundaries: await prisma.geographicBoundary.findMany(),
        roadIssues: await prisma.roadIssue.findMany(),
        issueImages: await prisma.issueImage.findMany(),
        workOrders: await prisma.workOrder.findMany(),
        statusHistory: await prisma.statusHistory.findMany({ orderBy: { createdAt: "asc" } }),
        notifications: await prisma.notification.findMany(),
        auditLogs: await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
        issueCommunityUpdates: await prisma.issueCommunityUpdate.findMany(),
        communityPosts: await prisma.communityPost.findMany(),
        communityComments: await prisma.communityComment.findMany({ orderBy: { createdAt: "asc" } }),
        communityReactions: await prisma.communityReaction.findMany(),
        communityPostReports: await prisma.communityPostReport.findMany(),
        approvalRecords: await prisma.approvalRecord.findMany({ orderBy: { createdAt: "asc" } }),
      },
    }

    const counts: Record<string, number> = {}
    for (const [table, rows] of Object.entries(snapshot.tables)) {
      counts[table] = rows.length
    }

    const latestJsonPath = path.resolve(backupDir, "sqlite-snapshot-latest.json")
    const stampedJsonPath = path.resolve(backupDir, `sqlite-snapshot-${stamp}.json`)
    const payload = JSON.stringify({ ...snapshot, counts }, null, 2)

    fs.writeFileSync(stampedJsonPath, payload, "utf-8")
    fs.writeFileSync(latestJsonPath, payload, "utf-8")

    console.log("---------------------------------------------------------------")
    console.log("✅ SQLite Snapshot Export Completed")
    console.log(`   Latest snapshot: ${latestJsonPath}`)
    console.log("   Verified Table Counts:")
    for (const [table, count] of Object.entries(counts)) {
      console.log(`   - ${table.padEnd(26)}: ${count}`)
    }
    console.log("---------------------------------------------------------------")
  } finally {
    await prisma.$disconnect()
  }
}

exportSnapshot().catch((err) => {
  console.error("❌ Snapshot export failed:", err)
  process.exit(1)
})
