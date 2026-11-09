import React, { useState } from "react"
import {
  AlertTriangle,
  Building2,
  Check,
  HardHat,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { apiClient, ApiUser } from "../services/apiClient"

type AuthModalProps = {
  isOpen: boolean
  onClose: () => void
  currentUser: ApiUser | null
  onUserChange: (user: ApiUser | null) => void
}

const SEEDED_ACCOUNTS = [
  {
    role: "SUPER_ADMIN",
    label: "Super Admin",
    name: "System Administrator",
    email: "admin@roadguard.local",
    password: "Password123!",
    badgeClass: "badge--super",
    icon: ShieldCheck,
    description: "Full municipal jurisdiction, ward allocation, work order dispatch & global audit oversight.",
  },
  {
    role: "DEPARTMENT_ADMIN",
    label: "Dept Admin",
    name: "Chief Marcus Brody",
    email: "highways.chief@roadguard.local",
    password: "Password123!",
    badgeClass: "badge--authority",
    icon: Building2,
    description: "Highways & Infrastructure lead: Work order dispatch, contractor crew management & SLA triage.",
  },
  {
    role: "INSPECTOR",
    label: "Field Inspector",
    name: "Inspector Sarah Jenkins",
    email: "inspector.sarah@roadguard.local",
    password: "Password123!",
    badgeClass: "badge--inspector",
    icon: HardHat,
    description: "On-site asphalt quality assessor: Verifies structural cavities, approves hot-mix asphalt repairs.",
  },
  {
    role: "CITIZEN",
    label: "Citizen Reporter",
    name: "Elena Vance (Citizen Alliance)",
    email: "citizen.test@roadguard.local",
    password: "Password123!",
    badgeClass: "badge--citizen",
    icon: User,
    description: "Community resident: Precise GPS road hazard reporting, photo evidence & corroboration votes.",
  },
]

export default function AuthModal({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
}: AuthModalProps) {
  const [tab, setTab] = useState<"quick" | "login" | "register">("quick")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  React.useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleQuickLogin = async (acc: (typeof SEEDED_ACCOUNTS)[0]) => {
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const user = await apiClient.auth.login({
        email: acc.email,
        password: acc.password,
      })
      onUserChange(user)
      setSuccessMessage(`Authenticated as ${user.fullName} (${acc.label})`)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      setError(err.message || "Failed to authenticate into pilot account.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const user = await apiClient.auth.login({ email, password })
      onUserChange(user)
      setSuccessMessage(`Welcome back, ${user.fullName}!`)
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      setError(err.message || "Invalid email or password.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const user = await apiClient.auth.register({
        fullName,
        email,
        password,
        phoneNumber: phone || undefined,
      })
      onUserChange(user)
      setSuccessMessage("Citizen account created! Welcome to RoadGuard AI.")
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: any) {
      setError(err.message || "Registration failed. Please check your details.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await apiClient.auth.logout()
      onUserChange(null)
      onClose()
    } catch (err: any) {
      setError(err.message || "Logout failed.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="report-modal-overlay">
      <div className="report-modal-backdrop" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="report-modal-card glass auth-modal-card"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="modal-close-btn"
          aria-label="Close authentication dialog"
        >
          <X size={18} />
        </button>

        {currentUser ? (
          /* ACTIVE USER PROFILE & SWITCHER VIEW */
          <div className="auth-profile-stage">
            <div className="modal-header">
              <p className="eyebrow">
                <span /> MUNICIPAL ACCESS MANAGEMENT
              </p>
              <h2 id="auth-modal-title" className="modal-title">ACTIVE SESSION PROFILE</h2>
              <p className="modal-subtitle">
                Authenticated session with role-based access control and live audit tracking.
              </p>
            </div>

            <div className="active-user-card glass">
              <div className="active-user-header">
                <div className="active-avatar">
                  {currentUser.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="active-user-meta">
                  <div className="active-user-name-row">
                    <h3>{currentUser.fullName}</h3>
                    <span className={`role-badge role-${currentUser.role.toLowerCase()}`}>
                      {currentUser.role.replace("_", " ")}
                    </span>
                  </div>
                  <p className="active-user-email">{currentUser.email}</p>
                </div>
              </div>

              <div className="active-user-grid">
                <div>
                  <small>ACCOUNT ID</small>
                  <strong>{currentUser.id.slice(0, 12)}...</strong>
                </div>
                <div>
                  <small>PERMISSION TIER</small>
                  <strong>
                    {currentUser.role === "SUPER_ADMIN"
                      ? "Tier 4 (Full Admin)"
                      : currentUser.role === "DEPARTMENT_ADMIN"
                        ? "Tier 3 (Dept Chief)"
                        : currentUser.role === "INSPECTOR"
                          ? "Tier 2 (Field Inspector)"
                          : "Tier 1 (Citizen Reporter)"}
                  </strong>
                </div>
                <div>
                  <small>SESSION STATUS</small>
                  <strong className="text-emerald flex items-center gap-1">
                    <span className="live-dot" /> Active HTTP-Only Cookie
                  </strong>
                </div>
              </div>
            </div>

            {error && (
              <div className="drawer-error-banner">
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            <div className="quick-switch-section">
              <h4>SWITCH MUNICIPAL PERSONA (PILOT EVALUATION)</h4>
              <p className="text-xs text-muted mb-3">
                Quickly transition roles to audit permission boundaries and lifecycle workflows:
              </p>
              <div className="seeded-account-list">
                {SEEDED_ACCOUNTS.map((acc) => {
                  const Icon = acc.icon
                  const isCurrent = currentUser.email === acc.email
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={isLoading || isCurrent}
                      onClick={() => handleQuickLogin(acc)}
                      className={`persona-card glass ${isCurrent ? "active-persona" : ""}`}
                    >
                      <div className="persona-icon-col">
                        <Icon size={18} />
                      </div>
                      <div className="persona-info-col">
                        <div className="persona-top">
                          <strong>{acc.name}</strong>
                          <span className={`role-badge role-${acc.role.toLowerCase()}`}>
                            {acc.label}
                          </span>
                        </div>
                        <p>{acc.description}</p>
                      </div>
                      {isCurrent && <Check size={16} className="text-emerald" />}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="auth-footer-actions">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoading}
                className="button button--secondary logout-btn"
              >
                <LogOut size={14} />
                <span>Sign Out Current Session</span>
              </button>
            </div>
          </div>
        ) : (
          /* LOGIN / REGISTRATION TABS VIEW */
          <div className="auth-forms-stage">
            <div className="modal-header">
              <p className="eyebrow">
                <span /> ROADGUARD MUNICIPAL CLOUD
              </p>
              <h2 className="modal-title">PILOT AUTHENTICATION</h2>
              <p className="modal-subtitle">
                Sign in with municipal credentials or try one of the pre-configured role accounts.
              </p>
            </div>

            {/* Auth Mode Tabs */}
            <div className="auth-nav-tabs">
              <button
                type="button"
                onClick={() => {
                  setTab("quick")
                  setError(null)
                }}
                className={`auth-tab-btn ${tab === "quick" ? "active" : ""}`}
              >
                <KeyRound size={14} />
                <span>Quick Pilot Switcher</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("login")
                  setError(null)
                }}
                className={`auth-tab-btn ${tab === "login" ? "active" : ""}`}
              >
                <Lock size={14} />
                <span>Email Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("register")
                  setError(null)
                }}
                className={`auth-tab-btn ${tab === "register" ? "active" : ""}`}
              >
                <UserCheck size={14} />
                <span>Register Citizen</span>
              </button>
            </div>

            {error && (
              <div className="drawer-error-banner">
                <AlertTriangle size={15} />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="drawer-success-banner">
                <Check size={15} />
                <span>{successMessage}</span>
              </div>
            )}

            {tab === "quick" && (
              <div className="quick-switch-section">
                <div className="seeded-account-list">
                  {SEEDED_ACCOUNTS.map((acc) => {
                    const Icon = acc.icon
                    return (
                      <button
                        key={acc.email}
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleQuickLogin(acc)}
                        className="persona-card glass"
                      >
                        <div className="persona-icon-col">
                          <Icon size={18} />
                        </div>
                        <div className="persona-info-col">
                          <div className="persona-top">
                            <strong>{acc.name}</strong>
                            <span className={`role-badge role-${acc.role.toLowerCase()}`}>
                              {acc.label}
                            </span>
                          </div>
                          <p>{acc.description}</p>
                          <small className="text-muted font-mono">{acc.email}</small>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {tab === "login" && (
              <form onSubmit={handleStandardLogin} className="auth-form">
                <div className="form-group">
                  <label className="field-label">OFFICIAL EMAIL ADDRESS</label>
                  <div className="input-with-icon">
                    <Mail size={16} />
                    <input
                      type="email"
                      required
                      placeholder="e.g. inspector.sarah@roadguard.local"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">PASSWORD</label>
                  <div className="input-with-icon">
                    <Lock size={16} />
                    <input
                      type="password"
                      required
                      placeholder="Enter secure password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-actions mt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="button button--primary w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Authenticate Session</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {tab === "register" && (
              <form onSubmit={handleRegister} className="auth-form">
                <div className="form-group">
                  <label className="field-label">FULL NAME</label>
                  <div className="input-with-icon">
                    <User size={16} />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">EMAIL ADDRESS</label>
                  <div className="input-with-icon">
                    <Mail size={16} />
                    <input
                      type="email"
                      required
                      placeholder="e.g. jane@community.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">PASSWORD (MIN 8 CHARS)</label>
                  <div className="input-with-icon">
                    <Lock size={16} />
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="At least 8 characters with a symbol/number"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">PHONE NUMBER (OPTIONAL)</label>
                  <div className="input-with-icon">
                    <Phone size={16} />
                    <input
                      type="tel"
                      placeholder="e.g. +44 7700 900123"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-actions mt-4">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="button button--primary w-full"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Registering account...</span>
                      </>
                    ) : (
                      <span>Create Citizen Account</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

