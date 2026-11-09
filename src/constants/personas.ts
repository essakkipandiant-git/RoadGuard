export interface MunicipalPersona {
  id: string
  role: "SUPER_ADMIN" | "DEPARTMENT_ADMIN" | "INSPECTOR" | "CITIZEN"
  tier: string
  label: string
  name: string
  email: string
  password: string
  departmentName?: string
  badgeClass: string
  description: string
  avatarInitial: string
}

export const MUNICIPAL_PERSONAS: MunicipalPersona[] = [
  {
    id: "f4f42518-782a-4317-aec0-baf28f33d4e0",
    role: "SUPER_ADMIN",
    tier: "Tier 4 (BMC Executive)",
    label: "Super Admin",
    name: "System Administrator",
    email: "admin@roadguard.local",
    password: "Password123!",
    departmentName: "MCGM Municipal Headquarters",
    badgeClass: "badge--super",
    description: "Full municipal jurisdiction, all 24 wards, inspector allocation, crew dispatch & audit trail.",
    avatarInitial: "S",
  },
  {
    id: "2a50cec1-ddc5-4317-96a7-d88583bbe402",
    role: "DEPARTMENT_ADMIN",
    tier: "Tier 3 (Department Chief)",
    label: "Dept Admin",
    name: "Chief Marcus Brody",
    email: "highways.chief@roadguard.local",
    password: "Password123!",
    departmentName: "Highways & Road Infrastructure",
    badgeClass: "badge--authority",
    description: "Highways lead: Contractor crew dispatch, asphalt hot-mix work orders & SLA resolution triage.",
    avatarInitial: "M",
  },
  {
    id: "8db7a0b9-e00b-4071-8ffd-ad4001434f0f",
    role: "INSPECTOR",
    tier: "Tier 2 (Field Inspector)",
    label: "Field Inspector",
    name: "Senior Inspector Sarah Chen",
    email: "inspector.sarah@roadguard.local",
    password: "Password123!",
    departmentName: "Quality Assurance & Road Audit",
    badgeClass: "badge--inspector",
    description: "On-site asphalt quality assessor: Verifies structural cavities, approves restored asphalt repairs.",
    avatarInitial: "S",
  },
  {
    id: "6ddc6bbc-5b3c-4128-9a48-8381012ceeee",
    role: "CITIZEN",
    tier: "Tier 1 (Citizen Observer)",
    label: "Citizen Reporter",
    name: "Elena Vance (Citizen Alliance)",
    email: "citizen.test@roadguard.local",
    password: "Password123!",
    badgeClass: "badge--citizen",
    description: "Community resident: Precise GPS hazard reporting, photographic evidence & corroboration votes.",
    avatarInitial: "E",
  },
]

