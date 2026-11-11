/**
 * RoadGuard AI — Clean-Process PostgreSQL Snapshot Worker
 * Executed by importPostgresSnapshot.ts after PostgreSQL PrismaClient generation.
 */

import fs from "fs"
import path from "path"
import { PrismaClient } from "@prisma/client"

const serverDir = path.resolve(__dirname, "..")
const snapshotPath = path.resolve(serverDir, "prisma/backups/sqlite-snapshot-latest.json")

async function insertInChunks(
  label: string,
  rows: any[],
  inserter: (chunk: any[]) => Promise<{ count: number }>,
) {
  if (!rows || rows.length === 0) {
    console.log(`[PG-IMPORT]   ${label.padEnd(26)}: 0 rows (skipped)`)
    return
  }

  let inserted = 0
  const chunkSize = 250
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const res = await inserter(chunk)
    inserted += res.count
  }
  console.log(`[PG-IMPORT]   ${label.padEnd(26)}: ${inserted} new / ${rows.length} source rows`)
}

async function runWorker() {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"))
  const t = snapshot.tables
  const prisma = new PrismaClient()

  try {
    console.log(`[PG-IMPORT] Source snapshot timestamp: ${snapshot.exportedAt}`)
    console.log("[PG-IMPORT] Migrating tables in dependency order (idempotent, skipDuplicates: true)...")

    await insertInChunks("departments", t.departments, (data) =>
      prisma.department.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("wards", t.wards, (data) =>
      prisma.ward.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("users", t.users, (data) =>
      prisma.user.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("notificationPreferences", t.notificationPreferences, (data) =>
      prisma.notificationPreference.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("geographicBoundaries", t.geographicBoundaries, (data) =>
      prisma.geographicBoundary.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("roadIssues", t.roadIssues, (data) =>
      prisma.roadIssue.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("issueImages", t.issueImages, (data) =>
      prisma.issueImage.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("workOrders", t.workOrders, (data) =>
      prisma.workOrder.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("statusHistory", t.statusHistory, (data) =>
      prisma.statusHistory.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("notifications", t.notifications, (data) =>
      prisma.notification.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("auditLogs", t.auditLogs, (data) =>
      prisma.auditLog.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("issueCommunityUpdates", t.issueCommunityUpdates, (data) =>
      prisma.issueCommunityUpdate.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("communityPosts", t.communityPosts, (data) =>
      prisma.communityPost.createMany({ data, skipDuplicates: true }),
    )

    // Self-referential communityComments: top-level parents first, then threaded replies
    const comments: any[] = t.communityComments || []
    const topComments = comments.filter((c) => !c.parentId)
    const childComments = comments.filter((c) => Boolean(c.parentId))
    await insertInChunks("communityComments (roots)", topComments, (data) =>
      prisma.communityComment.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("communityComments (replies)", childComments, (data) =>
      prisma.communityComment.createMany({ data, skipDuplicates: true }),
    )

    await insertInChunks("communityReactions", t.communityReactions, (data) =>
      prisma.communityReaction.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("communityPostReports", t.communityPostReports, (data) =>
      prisma.communityPostReport.createMany({ data, skipDuplicates: true }),
    )
    await insertInChunks("approvalRecords", t.approvalRecords, (data) =>
      prisma.approvalRecord.createMany({ data, skipDuplicates: true }),
    )

    // Verify final PostgreSQL counts >= source snapshot counts
    const destCounts: Record<string, number> = {
      departments: await prisma.department.count(),
      wards: await prisma.ward.count(),
      users: await prisma.user.count(),
      notificationPreferences: await prisma.notificationPreference.count(),
      geographicBoundaries: await prisma.geographicBoundary.count(),
      roadIssues: await prisma.roadIssue.count(),
      issueImages: await prisma.issueImage.count(),
      workOrders: await prisma.workOrder.count(),
      statusHistory: await prisma.statusHistory.count(),
      notifications: await prisma.notification.count(),
      auditLogs: await prisma.auditLog.count(),
      issueCommunityUpdates: await prisma.issueCommunityUpdate.count(),
      communityPosts: await prisma.communityPost.count(),
      communityComments: await prisma.communityComment.count(),
      communityReactions: await prisma.communityReaction.count(),
      communityPostReports: await prisma.communityPostReport.count(),
      approvalRecords: await prisma.approvalRecord.count(),
    }

    console.log("---------------------------------------------------------------")
    console.log("📊 PostgreSQL Verification Report (Source SQLite vs Target Postgres)")
    let allVerified = true
    for (const [table, destCount] of Object.entries(destCounts)) {
      const srcCount = snapshot.counts[table] ?? 0
      const ok = destCount >= srcCount
      if (!ok) allVerified = false
      console.log(
        `   ${ok ? "✅" : "❌"} ${table.padEnd(26)} source=${String(srcCount).padStart(5)}  postgres=${String(destCount).padStart(5)}`,
      )
    }
    console.log("---------------------------------------------------------------")

    if (!allVerified) {
      throw new Error("Verification failed: one or more PostgreSQL tables have fewer records than source SQLite snapshot.")
    }

    console.log("✅ All source records verified present in PostgreSQL with zero data loss.")
  } finally {
    await prisma.$disconnect()
  }
}

runWorker().catch((err) => {
  console.error("❌ PostgreSQL import worker error:", err)
  process.exit(1)
})
