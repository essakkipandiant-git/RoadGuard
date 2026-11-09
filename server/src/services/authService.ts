import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { Role } from "@prisma/client"
import { prisma } from "../config/prisma"
import { env } from "../config/env"
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} from "../utils/errors"
import {
  RegisterCitizenInput,
  LoginInput,
  ChangePasswordInput,
} from "../validators/authValidators"
import { AuthUser, JwtPayload } from "../types"

export class AuthService {
  /**
   * Generates a signed JWT session token.
   */
  static generateToken(payload: { userId: string; email: string; role: Role }): string {
    return jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
      },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_EXPIRES_IN as any,
      },
    )
  }

  /**
   * Cryptographically verifies a JWT session token.
   */
  static verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as JwtPayload
    } catch {
      throw new UnauthorizedError("Session has expired or is invalid. Please log in again.")
    }
  }

  /**
   * Registers a new public citizen account.
   * Public registration NEVER allows creation of privileged roles (INSPECTOR, ADMIN, SUPER_ADMIN).
   */
  static async registerCitizen(input: RegisterCitizenInput): Promise<{
    user: AuthUser
    token: string
  }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    })

    if (existing) {
      throw new ConflictError("An account with this email address already exists")
    }

    const passwordHash = await bcrypt.hash(input.password, 10)

    const user = await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        phoneNumber: input.phoneNumber || null,
        role: Role.CITIZEN, // Hardcoded: Public registration CANNOT create staff
        isActive: true,
        emailVerified: false,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        phoneNumber: true,
      },
    })

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    return { user, token }
  }

  /**
   * Authenticates any user (Citizen, Inspector, Dept Admin, Super Admin) via email & password.
   * Prevents account enumeration by returning identical generic error messages.
   */
  static async loginUser(input: LoginInput): Promise<{
    user: AuthUser
    token: string
  }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    })

    if (!user) {
      throw new UnauthorizedError("Invalid email or password")
    }

    if (!user.isActive) {
      throw new UnauthorizedError("This account has been deactivated. Please contact support.")
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash)
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password")
    }

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    const sanitizedUser: AuthUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      phoneNumber: user.phoneNumber,
    }

    return { user: sanitizedUser, token }
  }

  /**
   * Changes the password for an authenticated user after verifying their current password.
   */
  static async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundError("User account not found")
    }

    const isMatch = await bcrypt.compare(input.currentPassword, user.passwordHash)
    if (!isMatch) {
      throw new BadRequestError("Current password is incorrect")
    }

    const newHash = await bcrypt.hash(input.newPassword, 10)

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    })

    return { message: "Password updated successfully" }
  }

  /**
   * Retrieves sanitized profile of an authenticated user.
   */
  static async getUserProfile(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        departmentId: true,
        phoneNumber: true,
        isActive: true,
      },
    })

    if (!user || !user.isActive) {
      throw new NotFoundError("User account not found or is inactive")
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      phoneNumber: user.phoneNumber,
    }
  }
}

