import { Role } from "@prisma/client"

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: Role
  departmentId?: string | null
  phoneNumber?: string | null
}

export interface JwtPayload {
  userId: string
  email: string
  role: Role
  iat?: number
  exp?: number
}

