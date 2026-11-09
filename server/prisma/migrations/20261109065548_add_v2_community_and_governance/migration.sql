-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "statusUpdates" BOOLEAN NOT NULL DEFAULT true,
    "communityReplies" BOOLEAN NOT NULL DEFAULT true,
    "nearbyHazardAlerts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssueCommunityUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT,
    "updateType" TEXT NOT NULL DEFAULT 'STILL_EXISTS',
    "description" TEXT NOT NULL,
    "photos" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "observationDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "adminRemarks" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IssueCommunityUpdate_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "RoadIssue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IssueCommunityUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IssueCommunityUpdate_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL DEFAULT 'CITIZEN',
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "officialBadge" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL_DISCUSSION',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "photos" TEXT,
    "relatedIssueId" TEXT,
    "wardId" TEXT,
    "locality" TEXT,
    "upvotesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isModerated" BOOLEAN NOT NULL DEFAULT false,
    "moderationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommunityPost_relatedIssueId_fkey" FOREIGN KEY ("relatedIssueId") REFERENCES "RoadIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL DEFAULT 'CITIZEN',
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "officialBadge" TEXT,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "isModerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommunityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityComment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reactionType" TEXT NOT NULL DEFAULT 'UPVOTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityPostReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "reportedById" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityPostReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommunityPostReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "reviewerRole" TEXT,
    "reason" TEXT,
    "remarks" TEXT,
    "evidencePhotos" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalRecord_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "RoadIssue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalRecord_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeographicBoundary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "boundaryType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Mumbai',
    "state" TEXT NOT NULL DEFAULT 'Maharashtra',
    "country" TEXT NOT NULL DEFAULT 'India',
    "minLat" REAL NOT NULL,
    "maxLat" REAL NOT NULL,
    "minLng" REAL NOT NULL,
    "maxLng" REAL NOT NULL,
    "geoJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "issueId" TEXT,
    "linkUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("createdAt", "id", "isRead", "message", "title", "userId") SELECT "createdAt", "id", "isRead", "message", "title", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
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
    "assignedInspectorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REPORTED',
    "riskScore" INTEGER NOT NULL DEFAULT 50,
    "confirmationsCount" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "governmentReferenceId" TEXT,
    "governmentPortalUrl" TEXT,
    "officialDepartmentName" TEXT,
    "officialContactInfo" TEXT,
    "externalStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadIssue_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoadIssue_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoadIssue_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RoadIssue_assignedInspectorId_fkey" FOREIGN KEY ("assignedInspectorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RoadIssue" ("address", "confirmationsCount", "createdAt", "damageCategory", "damageSeverity", "departmentId", "depth", "description", "id", "latitude", "longitude", "reportNumber", "reportedById", "riskScore", "status", "title", "updatedAt", "wardId") SELECT "address", "confirmationsCount", "createdAt", "damageCategory", "damageSeverity", "departmentId", "depth", "description", "id", "latitude", "longitude", "reportNumber", "reportedById", "riskScore", "status", "title", "updatedAt", "wardId" FROM "RoadIssue";
DROP TABLE "RoadIssue";
ALTER TABLE "new_RoadIssue" RENAME TO "RoadIssue";
CREATE UNIQUE INDEX "RoadIssue_reportNumber_key" ON "RoadIssue"("reportNumber");
CREATE INDEX "RoadIssue_status_idx" ON "RoadIssue"("status");
CREATE INDEX "RoadIssue_damageCategory_idx" ON "RoadIssue"("damageCategory");
CREATE INDEX "RoadIssue_damageSeverity_idx" ON "RoadIssue"("damageSeverity");
CREATE INDEX "RoadIssue_latitude_longitude_idx" ON "RoadIssue"("latitude", "longitude");
CREATE INDEX "RoadIssue_createdAt_idx" ON "RoadIssue"("createdAt");
CREATE INDEX "RoadIssue_assignedInspectorId_idx" ON "RoadIssue"("assignedInspectorId");
CREATE INDEX "RoadIssue_isDemo_idx" ON "RoadIssue"("isDemo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "IssueCommunityUpdate_issueId_idx" ON "IssueCommunityUpdate"("issueId");

-- CreateIndex
CREATE INDEX "IssueCommunityUpdate_updateType_idx" ON "IssueCommunityUpdate"("updateType");

-- CreateIndex
CREATE INDEX "IssueCommunityUpdate_verificationStatus_idx" ON "IssueCommunityUpdate"("verificationStatus");

-- CreateIndex
CREATE INDEX "IssueCommunityUpdate_userId_idx" ON "IssueCommunityUpdate"("userId");

-- CreateIndex
CREATE INDEX "IssueCommunityUpdate_createdAt_idx" ON "IssueCommunityUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_category_idx" ON "CommunityPost"("category");

-- CreateIndex
CREATE INDEX "CommunityPost_relatedIssueId_idx" ON "CommunityPost"("relatedIssueId");

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_idx" ON "CommunityPost"("authorId");

-- CreateIndex
CREATE INDEX "CommunityPost_wardId_idx" ON "CommunityPost"("wardId");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_upvotesCount_idx" ON "CommunityPost"("upvotesCount");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_idx" ON "CommunityComment"("postId");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_idx" ON "CommunityComment"("authorId");

-- CreateIndex
CREATE INDEX "CommunityComment_parentId_idx" ON "CommunityComment"("parentId");

-- CreateIndex
CREATE INDEX "CommunityComment_createdAt_idx" ON "CommunityComment"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityReaction_postId_idx" ON "CommunityReaction"("postId");

-- CreateIndex
CREATE INDEX "CommunityReaction_userId_idx" ON "CommunityReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReaction_postId_userId_reactionType_key" ON "CommunityReaction"("postId", "userId", "reactionType");

-- CreateIndex
CREATE INDEX "CommunityPostReport_postId_idx" ON "CommunityPostReport"("postId");

-- CreateIndex
CREATE INDEX "CommunityPostReport_status_idx" ON "CommunityPostReport"("status");

-- CreateIndex
CREATE INDEX "CommunityPostReport_createdAt_idx" ON "CommunityPostReport"("createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRecord_issueId_idx" ON "ApprovalRecord"("issueId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_reviewerId_idx" ON "ApprovalRecord"("reviewerId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_actionType_idx" ON "ApprovalRecord"("actionType");

-- CreateIndex
CREATE INDEX "ApprovalRecord_createdAt_idx" ON "ApprovalRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GeographicBoundary_code_key" ON "GeographicBoundary"("code");

-- CreateIndex
CREATE INDEX "GeographicBoundary_code_idx" ON "GeographicBoundary"("code");

-- CreateIndex
CREATE INDEX "GeographicBoundary_boundaryType_idx" ON "GeographicBoundary"("boundaryType");

-- CreateIndex
CREATE INDEX "GeographicBoundary_city_idx" ON "GeographicBoundary"("city");
