-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoadIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "damageCategory" TEXT NOT NULL DEFAULT 'CAVITY',
    "damageSeverity" TEXT NOT NULL DEFAULT 'HIGH',
    "depth" REAL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "address" TEXT NOT NULL,
    "wardId" TEXT,
    "departmentId" TEXT,
    "reportedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "confirmationsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadIssue_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoadIssue_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoadIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoadIssue" ("address", "createdAt", "damageCategory", "damageSeverity", "departmentId", "depth", "description", "id", "latitude", "longitude", "reportNumber", "reportedById", "riskScore", "status", "title", "updatedAt", "wardId") SELECT "address", "createdAt", "damageCategory", "damageSeverity", "departmentId", "depth", "description", "id", "latitude", "longitude", "reportNumber", "reportedById", "riskScore", "status", "title", "updatedAt", "wardId" FROM "RoadIssue";
DROP TABLE "RoadIssue";
ALTER TABLE "new_RoadIssue" RENAME TO "RoadIssue";
CREATE UNIQUE INDEX "RoadIssue_reportNumber_key" ON "RoadIssue"("reportNumber");
CREATE INDEX "RoadIssue_status_idx" ON "RoadIssue"("status");
CREATE INDEX "RoadIssue_damageCategory_idx" ON "RoadIssue"("damageCategory");
CREATE INDEX "RoadIssue_damageSeverity_idx" ON "RoadIssue"("damageSeverity");
CREATE INDEX "RoadIssue_latitude_longitude_idx" ON "RoadIssue"("latitude", "longitude");
CREATE INDEX "RoadIssue_createdAt_idx" ON "RoadIssue"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
