import { Router } from "express"
import {
  register,
  login,
  logout,
  getProfile,
  changePassword,
  getNotifications,
  markNotificationRead,
} from "../controllers/authController"
import { validateBody } from "../middleware/validateRequest"
import {
  registerCitizenSchema,
  loginSchema,
  changePasswordSchema,
} from "../validators/authValidators"
import { requireAuth } from "../middleware/authMiddleware"
import { authLimiter } from "../middleware/rateLimiter"

export const authRouter = Router()

/**
 * @route   POST /api/v1/auth/register
 * @desc    Citizen registration
 * @access  Public
 */
authRouter.post(
  "/register",
  validateBody(registerCitizenSchema),
  register,
)

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user & establish session
 * @access  Public (Rate limited)
 */
authRouter.post(
  "/login",
  authLimiter,
  validateBody(loginSchema),
  login,
)

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Terminate active session & clear cookie
 * @access  Authenticated
 */
authRouter.post(
  "/logout",
  requireAuth,
  logout,
)

/**
 * @route   GET /api/v1/auth/me
 * @desc    Retrieve authenticated user profile
 * @access  Authenticated
 */
authRouter.get(
  "/me",
  requireAuth,
  getProfile,
)

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change authenticated user password
 * @access  Authenticated
 */
authRouter.post(
  "/change-password",
  requireAuth,
  validateBody(changePasswordSchema),
  changePassword,
)

/**
 * @route   GET /api/v1/auth/notifications
 * @desc    Retrieve notifications for authenticated user
 * @access  Authenticated
 */
authRouter.get(
  "/notifications",
  requireAuth,
  getNotifications,
)

/**
 * @route   PATCH /api/v1/auth/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Authenticated
 */
authRouter.patch(
  "/notifications/:id/read",
  requireAuth,
  markNotificationRead,
)


