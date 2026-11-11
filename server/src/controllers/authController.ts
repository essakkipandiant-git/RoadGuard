import { Request, Response, NextFunction } from "express"
import { AuthService } from "../services/authService"
import { AuditService } from "../services/auditService"
import { SESSION_COOKIE_NAME } from "../middleware/authMiddleware"
import { env } from "../config/env"
import { prisma } from "../config/prisma"

export function getCookieOptions() {
  const isProd = env.NODE_ENV === "production"
  return {
    httpOnly: true,
    secure: isProd,
    // Cross-origin HTTPS deployments (e.g. Render Static Site -> Render Web Service)
    // require SameSite=None; Secure for browser cookie transmission.
    sameSite: (isProd ? "none" : "lax") as "none" | "lax" | "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  }
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user, token } = await AuthService.registerCitizen(req.body)

    // Set secure HTTP-only cookie
    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions())

    // Audit log
    await AuditService.logAction({
      userId: user.id,
      action: "USER_REGISTER",
      entityType: "User",
      entityId: user.id,
      ipAddress: req.ip,
    })

    res.status(201).json({
      success: true,
      data: { user, token },
      message: "Citizen account registered successfully",
    })
  } catch (error) {
    next(error)
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { user, token } = await AuthService.loginUser(req.body)

    // Set secure HTTP-only cookie
    res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions())

    // Audit log
    await AuditService.logAction({
      userId: user.id,
      action: "USER_LOGIN",
      entityType: "User",
      entityId: user.id,
      ipAddress: req.ip,
    })

    res.status(200).json({
      success: true,
      data: { user, token },
      message: "Logged in successfully",
    })
  } catch (error) {
    next(error)
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user) {
      await AuditService.logAction({
        userId: req.user.id,
        action: "USER_LOGOUT",
        entityType: "User",
        entityId: req.user.id,
        ipAddress: req.ip,
      })
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      ...getCookieOptions(),
      maxAge: 0,
    })

    res.status(200).json({
      success: true,
      data: null,
      message: "Logged out successfully",
    })
  } catch (error) {
    next(error)
  }
}

export async function getProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await AuthService.getUserProfile(req.user!.id)

    res.status(200).json({
      success: true,
      data: { user },
      message: "Profile retrieved successfully",
    })
  } catch (error) {
    next(error)
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await AuthService.changePassword(req.user!.id, req.body)

    await AuditService.logAction({
      userId: req.user!.id,
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: req.user!.id,
      ipAddress: req.ip,
    })

    res.status(200).json({
      success: true,
      data: null,
      message: result.message,
    })
  } catch (error) {
    next(error)
  }
}

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    res.status(200).json({
      success: true,
      data: { notifications },
    })
  } catch (error) {
    next(error)
  }
}

export async function markNotificationRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const updated = await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { isRead: true },
    })

    res.status(200).json({
      success: true,
      data: { count: updated.count },
      message: "Notification marked as read",
    })
  } catch (error) {
    next(error)
  }
}


