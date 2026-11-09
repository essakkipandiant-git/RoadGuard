import { Router } from "express"
import { IssueController } from "../controllers/issueController"
import { UploadController } from "../controllers/uploadController"
import { CommunityUpdateController } from "../controllers/communityUpdateController"
import { authenticate, requireAuth } from "../middleware/authMiddleware"
import { uploadSingleImage } from "../middleware/uploadMiddleware"
import { reportLimiter } from "../middleware/rateLimiter"
import { validateBody, validateQuery } from "../middleware/validateRequest"
import {
  createIssueSchema,
  listIssuesQuerySchema,
  supportIssueSchema,
  updateIssueStatusSchema,
  calculateRiskSchema,
  checkDuplicateSchema,
  updateOfficialInfoSchema,
  issueActionSchema,
  createCommunityUpdateSchema,
  reviewCommunityUpdateSchema,
} from "../validators/issueValidators"

export const issueRouter = Router()

/**
 * @route   POST /api/v1/issues/calculate-risk
 * @desc    Calculate explainable multi-factor risk score before submission
 * @access  Authenticated
 */
issueRouter.post(
  "/calculate-risk",
  requireAuth,
  validateBody(calculateRiskSchema),
  IssueController.calculateRisk,
)

/**
 * @route   POST /api/v1/issues/check-duplicate
 * @desc    Check for potential duplicate road hazards within threshold radius
 * @access  Public / Authenticated
 */
issueRouter.post(
  "/check-duplicate",
  authenticate,
  validateBody(checkDuplicateSchema),
  IssueController.checkDuplicate,
)

/**
 * @route   POST /api/v1/issues
 * @desc    Submit a new road defect report
 * @access  Authenticated (Citizen, Inspector, Dept Admin, Super Admin)
 */
issueRouter.post(
  "/",
  requireAuth,
  reportLimiter,
  validateBody(createIssueSchema),
  IssueController.createIssue,
)

/**
 * @route   GET /api/v1/issues
 * @desc    List issues with filters, search, and pagination
 * @access  Public / Authenticated
 */
issueRouter.get(
  "/",
  authenticate,
  validateQuery(listIssuesQuerySchema),
  IssueController.getIssues,
)

/**
 * @route   GET /api/v1/issues/my-reports
 * @desc    Get all reports submitted by the requesting user
 * @access  Authenticated
 */
issueRouter.get(
  "/my-reports",
  requireAuth,
  IssueController.getMyReports,
)

/**
 * @route   GET /api/v1/issues/:id
 * @desc    Get detailed issue by internal UUID or reportNumber (e.g. RG-10492)
 * @access  Public / Authenticated
 */
issueRouter.get(
  "/:id",
  authenticate,
  IssueController.getIssueById,
)

/**
 * @route   GET /api/v1/issues/:id/timeline
 * @desc    Get chronological recorded timeline of actual events
 * @access  Public / Authenticated
 */
issueRouter.get(
  "/:id/timeline",
  authenticate,
  IssueController.getTimeline,
)

/**
 * @route   PATCH /api/v1/issues/:id/official-info
 * @desc    Update government reference ID and official municipal department details
 * @access  Authenticated (Field Admin, Dept Admin, Super Admin)
 */
issueRouter.patch(
  "/:id/official-info",
  requireAuth,
  validateBody(updateOfficialInfoSchema),
  IssueController.updateOfficialInfo,
)

/**
 * @route   POST /api/v1/issues/:id/actions
 * @desc    Execute authorized lifecycle management actions (verify, reject, work order, etc.)
 * @access  Authenticated (Authorized staff or citizen reopen)
 */
issueRouter.post(
  "/:id/actions",
  requireAuth,
  validateBody(issueActionSchema),
  IssueController.executeAction,
)

/**
 * @route   POST /api/v1/issues/:id/community-updates
 * @desc    Submit citizen observation or repair confirmation on existing defect
 * @access  Authenticated
 */
issueRouter.post(
  "/:id/community-updates",
  requireAuth,
  validateBody(createCommunityUpdateSchema),
  CommunityUpdateController.createUpdate,
)

/**
 * @route   GET /api/v1/issues/:id/community-updates
 * @desc    Get all community observations and evidence for a defect
 * @access  Public / Authenticated
 */
issueRouter.get(
  "/:id/community-updates",
  authenticate,
  CommunityUpdateController.getUpdates,
)

/**
 * @route   PATCH /api/v1/issues/:id/community-updates/:updateId/review
 * @desc    Formally approve or reject a citizen repair claim or evidence
 * @access  Authenticated (Staff only)
 */
issueRouter.patch(
  "/:id/community-updates/:updateId/review",
  requireAuth,
  validateBody(reviewCommunityUpdateSchema),
  CommunityUpdateController.reviewUpdate,
)

/**
 * @route   POST /api/v1/issues/:id/support
 * @desc    Confirm/support an existing issue (community duplicate corroboration)
 * @access  Authenticated
 */
issueRouter.post(
  "/:id/support",
  requireAuth,
  validateBody(supportIssueSchema),
  IssueController.supportIssue,
)

/**
 * @route   PATCH /api/v1/issues/:id/status
 * @desc    Transition defect lifecycle status with role authorization
 * @access  Authenticated (Inspector, Dept Admin, Super Admin, Citizen reopen)
 */
issueRouter.patch(
  "/:id/status",
  requireAuth,
  validateBody(updateIssueStatusSchema),
  IssueController.updateIssueStatus,
)

/**
 * @route   POST /api/v1/issues/:id/images
 * @desc    Upload and attach an image to an issue (e.g. inspection evidence, repair verification)
 * @access  Authenticated
 */
issueRouter.post(
  "/:id/images",
  requireAuth,
  uploadSingleImage,
  UploadController.attachIssueImage,
)

/**
 * @route   DELETE /api/v1/issues/:id/images/:imageId
 * @desc    Remove an image from an issue and delete from storage
 * @access  Authenticated (Staff or issue owner)
 */
issueRouter.delete(
  "/:id/images/:imageId",
  requireAuth,
  UploadController.removeIssueImage,
)


