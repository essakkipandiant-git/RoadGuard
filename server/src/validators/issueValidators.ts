import { z } from "zod"
import { DamageCategory, DamageSeverity, IssueStatus } from "@prisma/client"

export const createIssueSchema = z.object({
  title: z
    .string({ required_error: "Title is required" })
    .trim()
    .min(3, "Title must be at least 3 characters long")
    .max(120, "Title cannot exceed 120 characters"),
  description: z
    .string()
    .trim()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional()
    .nullable(),
  damageCategory: z.nativeEnum(DamageCategory, {
    errorMap: () => ({
      message: "Category must be one of: CAVITY, CRACK, EDGE, DEPRESSION, RUTTING",
    }),
  }),
  damageSeverity: z.nativeEnum(DamageSeverity, {
    errorMap: () => ({
      message: "Severity must be one of: CRITICAL, HIGH, MODERATE, LOW",
    }),
  }),
  depth: z
    .number()
    .min(0, "Depth cannot be negative")
    .max(1000, "Depth cannot exceed 1000mm")
    .optional()
    .nullable(),
  latitude: z
    .number({ required_error: "Latitude is required" })
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  longitude: z
    .number({ required_error: "Longitude is required" })
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  address: z
    .string({ required_error: "Address is required" })
    .trim()
    .min(3, "Address must be at least 3 characters long")
    .max(255, "Address cannot exceed 255 characters"),
  roadClass: z.enum(["arterial", "collector", "local", "pedestrian_cycle"]).optional().nullable(),
  wardId: z.string().uuid("Invalid Ward ID").optional().nullable(),
  departmentId: z.string().uuid("Invalid Department ID").optional().nullable(),
  photoUrl: z.string().url("Photo URL must be a valid URL").optional().nullable(),
  forceDuplicate: z.boolean().optional().default(false),
})

export type CreateIssueInput = z.infer<typeof createIssueSchema>

export const listIssuesQuerySchema = z.object({
  status: z.nativeEnum(IssueStatus).optional(),
  severity: z.nativeEnum(DamageSeverity).optional(),
  category: z.nativeEnum(DamageCategory).optional(),
  wardId: z.string().optional(),
  departmentId: z.string().optional(),
  assignedInspectorId: z.string().optional(),
  search: z.string().trim().optional(),
  minRisk: z.coerce.number().min(0).max(100).optional(),
  maxRisk: z.coerce.number().min(0).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "riskScore", "updatedAt", "confirmationsCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
})

export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>

export const supportIssueSchema = z.object({
  notes: z.string().trim().max(500, "Notes cannot exceed 500 characters").optional(),
})

export type SupportIssueInput = z.infer<typeof supportIssueSchema>

export const updateIssueStatusSchema = z.object({
  targetStatus: z.nativeEnum(IssueStatus, {
    errorMap: () => ({
      message: "Invalid targetStatus. Must be a recognized IssueStatus.",
    }),
  }),
  remarks: z.string().trim().max(1000, "Remarks cannot exceed 1000 characters").optional(),
  evidencePhotoUrl: z.string().url("Evidence Photo URL must be valid").optional(),
})

export type UpdateIssueStatusInput = z.infer<typeof updateIssueStatusSchema>

export const calculateRiskSchema = z.object({
  damageCategory: z.nativeEnum(DamageCategory),
  damageSeverity: z.nativeEnum(DamageSeverity).optional(),
  depth: z.number().min(0).max(1000).optional().nullable(),
  surfaceLossRatio: z.number().min(0).max(1).optional().nullable(),
  detectionCount: z.number().int().min(1).max(50).optional().nullable(),
  roadClass: z.enum(["arterial", "collector", "local", "pedestrian_cycle"]).optional().nullable(),
  vehiclesPerHour: z.number().min(0).optional().nullable(),
  distanceMeters: z.number().min(0).optional().nullable(),
  nearestSensitiveType: z.enum(["hospital", "school", "transit", "crossing", "none"]).optional().nullable(),
  confirmationsCount: z.number().int().min(0).optional().nullable(),
  createdTimestamp: z.string().datetime().optional().nullable(),
})

export type CalculateRiskInput = z.infer<typeof calculateRiskSchema>

export const checkDuplicateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  damageCategory: z.nativeEnum(DamageCategory).optional(),
  thresholdMeters: z.number().min(5).max(500).optional().default(40),
})

export type CheckDuplicateInput = z.infer<typeof checkDuplicateSchema>

export const updateOfficialInfoSchema = z.object({
  governmentReferenceId: z.string().trim().max(100).optional().nullable(),
  governmentPortalUrl: z.string().trim().url("Must be a valid URL").optional().nullable().or(z.literal("")),
  officialDepartmentName: z.string().trim().max(150).optional().nullable(),
  officialContactInfo: z.string().trim().max(150).optional().nullable(),
  externalStatus: z.string().trim().max(100).optional().nullable(),
})

export type UpdateOfficialInfoInput = z.infer<typeof updateOfficialInfoSchema>

export const issueActionSchema = z.object({
  actionType: z.enum([
    "VERIFY_REPORT",
    "REJECT_REPORT",
    "ASSIGN_INSPECTOR",
    "ASSIGN_DEPARTMENT",
    "DISPATCH_WORK_ORDER",
    "SUBMIT_REPAIR_EVIDENCE",
    "APPROVE_REPAIR",
    "REJECT_REPAIR",
    "CLOSE_ISSUE",
    "REOPEN_ISSUE",
    "RETURN_FOR_CORRECTION",
    "UPDATE_PROGRESS",
    "UPDATE_STATUS",
  ]),
  targetStatus: z.nativeEnum(IssueStatus).optional().nullable(),
  assignedInspectorId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  workDescription: z.string().trim().max(1000).optional().nullable(),
  priority: z.enum(["EMERGENCY", "HIGH", "MEDIUM", "LOW"]).optional(),
  scheduledDate: z.string().datetime().optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
  evidencePhotos: z.array(z.string().url()).optional(),
})

export type IssueActionInput = z.infer<typeof issueActionSchema>

export const createCommunityUpdateSchema = z.object({
  updateType: z.enum([
    "STILL_EXISTS",
    "WORSENED",
    "REPAIR_IN_PROGRESS",
    "APPEARS_REPAIRED",
    "HAZARD_CLEARED",
  ]),
  description: z
    .string({ required_error: "Description is required" })
    .trim()
    .min(5, "Description must be at least 5 characters long")
    .max(1000, "Description cannot exceed 1000 characters"),
  photos: z.array(z.string().url("Must be valid photo URL")).optional().default([]),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
})

export type CreateCommunityUpdateInput = z.infer<typeof createCommunityUpdateSchema>

export const reviewCommunityUpdateSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "FLAGGED"]),
  adminRemarks: z
    .string({ required_error: "Administrative review remarks are required" })
    .trim()
    .min(3, "Remarks must be at least 3 characters long")
    .max(1000, "Remarks cannot exceed 1000 characters"),
})

export type ReviewCommunityUpdateInput = z.infer<typeof reviewCommunityUpdateSchema>

