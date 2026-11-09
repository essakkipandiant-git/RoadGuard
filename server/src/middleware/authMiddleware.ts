import { Request, Response, NextFunction } from "express"
import { AuthService } from "../services/authService"
import { prisma } from "../config/prisma"
import { UnauthorizedError } from "../utils/errors"
import { AuthUser } from "../types"

export const SESSION_COOKIE_NAME = "token"

/**
 * Extracts and verifies JWT from HTTP-only cookie or Authorization header.
 * Attaches authenticated user to req.user if valid.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    let token: string | undefined

    // 1. Check HTTP-only cookie
    if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
      token = req.cookies[SESSION_COOKIE_NAME]
    }
    // 2. Check Authorization Bearer header
    else if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.substring(7)
    }

    if (!token) {
      req.user = undefined
      return next()
    }

    const payload = AuthService.verifyToken(token)

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        departmentId: true,
        phoneNumber: true,
        isActive: true,
      },
    })

    if (!user || !user.isActive) {
      req.user = undefined
      return next()
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      phoneNumber: user.phoneNumber,
    }

    next()
  } catch (error) {
    req.user = undefined
    next(error)
  }
}

/**
 * Enforces that a valid authenticated session exists.
 * Rejects unauthenticated requests with 401 Unauthorized.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.user) {
    return next()
  }

  // If authenticate hasn't run yet, run it
  await authenticate(req, res, (err) => {
    if (err) return next(err)
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required. Please log in."))
    }
    next()
  })
}

