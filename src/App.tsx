import { useEffect, useRef, useState, useMemo, lazy, Suspense } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronRight,
  Crosshair,
  Globe,
  Layers,
  MapPin,
  Menu,
  Navigation,
  ShieldCheck,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react"
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"
import type { SelectedLocation } from "./components/GlobeLocationPicker"
const GlobeLocationPicker = lazy(() => import("./components/GlobeLocationPicker"))
import Interactive2DMap from "./components/Interactive2DMap"
import PotholeReportModal from "./components/PotholeReportModal"
import IssueDetailDrawer from "./components/IssueDetailDrawer"
import IssueManagementWorkspace from "./components/IssueManagementWorkspace"
import CityTriageDashboard from "./components/CityTriageDashboard"
import AuthModal from "./components/AuthModal"
import SyncReportsBanner from "./components/SyncReportsBanner"
import { RoadIssue, UserRole } from "./types/roadguard"
import { RoadIssueService } from "./services/roadIssueService"
import { apiClient, ApiUser, mapBackendRole } from "./services/apiClient"
import { MUNICIPAL_PERSONAS } from "./constants/personas"

// Continuous cinematic urban road visual assets (Golden-hour city asphalt journey)
const heroRoadImage = "/images/hero_road.jpg"
const detectionAsphaltImage = "/images/detection_asphalt.jpg"
const aerialGridImage = "/images/aerial_grid.jpg"
const repairedRoadImage = "/images/repaired_road.jpg"
const cityPanoramaImage = "/images/city_panorama.jpg"

const navItems = [
  ["Home", "home"],
  ["How It Works", "detection"],
  ["Risk Map", "risk-map"],
  ["Resolution", "repair"],
  ["Impact", "impact"],
  ["About", "community"],
]

type ButtonLinkProps = {
  href?: string
  children: React.ReactNode
  variant?: "primary" | "secondary" | "dark"
  onClick?: (e: React.MouseEvent) => void
  className?: string
}

function ButtonLink({
  href,
  children,
  variant = "primary",
  onClick,
  className = "",
}: ButtonLinkProps) {
  if (!href && onClick) {
    return (
      <button
        type="button"
        className={`button button--${variant} ${className}`}
        onClick={onClick}
      >
        <span>{children}</span>
        <ArrowDownRight size={17} aria-hidden="true" />
      </button>
    )
  }
  return (
    <a
      className={`button button--${variant} ${className}`}
      href={href || "#report"}
      onClick={onClick}
    >
      <span>{children}</span>
      <ArrowDownRight size={17} aria-hidden="true" />
    </a>
  )
}

function DottedTitle({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <h2 className={`dot-title ${className}`}>{children}</h2>
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, margin: "-12%" })
  const reduce = useReducedMotion()
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 32 }}
      animate={visible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Header({
  active,
  onOpenGlobe,
  onOpenTriage,
  onOpenAuth,
  issuesCount,
  currentUser,
}: {
  active: string
  onOpenGlobe: () => void
  onOpenTriage: () => void
  onOpenAuth: () => void
  issuesCount: number
  currentUser: ApiUser | null
}) {
  const [open, setOpen] = useState(false)
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    return scrollY.on("change", (latest) => {
      setScrolled(latest > 60)
    })
  }, [scrollY])

  return (
    <header className={`nav-shell ${scrolled ? "nav-scrolled" : ""}`}>
      <a href="#home" className="brand" aria-label="RoadGuard AI home">
        <span className="brand-mark">
          <span />
        </span>
        <span>
          ROADGUARD<sup>AI</sup>
        </span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        {navItems.map(([label, id]) => (
          <a className={active === id ? "active" : ""} href={`#${id}`} key={id}>
            {label}
          </a>
        ))}
      </nav>
      <div className="nav-actions-group">
        <button
          type="button"
          onClick={onOpenAuth}
          className="nav-user-button glass"
          title={
            currentUser
              ? `Signed in as ${currentUser.fullName} (${currentUser.role})`
              : "Sign in or switch municipal persona"
          }
        >
          {currentUser ? (
            <>
              <span className="nav-avatar-circle">
                {currentUser.fullName.charAt(0).toUpperCase()}
              </span>
              <span>{currentUser.fullName.split(" ")[0]}</span>
              <span className={`role-badge role-${currentUser.role.toLowerCase()}`}>
                {currentUser.role.replace("_", " ")}
              </span>
            </>
          ) : (
            <>
              <User size={14} />
              <span>Sign In</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenTriage}
          className="nav-triage-button glass"
          title="Open City Risk Triage & Management Dashboard"
        >
          <Activity size={14} className="text-vermilion" />
          <span>Manage</span>
          <span className="nav-count-badge">{issuesCount}</span>
        </button>
        <ButtonLink
          onClick={(e) => {
            e.preventDefault()
            onOpenGlobe()
          }}
        >
          Report a pothole
        </ButtonLink>
      </div>
      <button
        className="menu-toggle"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
      >
        {open ? <X /> : <Menu />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav
            className="mobile-nav"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {navItems.map(([label, id]) => (
              <a
                href={`#${id}`}
                key={id}
                onClick={() => setOpen(false)}
                className={active === id ? "active" : ""}
              >
                {label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenAuth()
              }}
              className="nav-user-button glass mb-2"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {currentUser ? (
                <>
                  <span className="nav-avatar-circle">
                    {currentUser.fullName.charAt(0).toUpperCase()}
                  </span>
                  <span>{currentUser.fullName} ({currentUser.role.replace("_", " ")})</span>
                </>
              ) : (
                <>
                  <User size={14} />
                  <span>Pilot Sign In / Personas</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onOpenTriage()
              }}
              className="nav-triage-button glass mb-2"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <Activity size={14} className="text-vermilion" />
              <span>City Risk Triage ({issuesCount})</span>
            </button>
            <ButtonLink
              onClick={(e) => {
                e.preventDefault()
                setOpen(false)
                onOpenGlobe()
              }}
            >
              Report a pothole
            </ButtonLink>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

/* =========================================================================
   00 / HERO: Continuous road approach — wide city view to pothole zoom
   ========================================================================= */
function Hero({ onOpenGlobe }: { onOpenGlobe: () => void }) {
  const containerRef = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  // Scroll linked forward progression
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  })

  const smooth = useSpring(scrollYProgress, {
    stiffness: 95,
    damping: 26,
    restDelta: 0.001,
  })

  // Approaching the visible pothole in the lower foreground
  const roadScale = useTransform(smooth, [0, 1], [1, reduce ? 1 : 1.32])
  const roadY = useTransform(smooth, [0, 1], ["0%", reduce ? "0%" : "12%"])
  const roadFilter = useTransform(smooth, [0, 1], [
    "contrast(1.08) brightness(0.96)",
    "contrast(1.15) brightness(0.9)",
  ])

  // Parallax on hero text and UI overlays
  const textY = useTransform(smooth, [0, 0.75], ["0%", reduce ? "0%" : "-26%"])
  const textOpacity = useTransform(smooth, [0, 0.65], [1, reduce ? 1 : 0.15])

  // Target lock reticle on the pothole as camera draws near
  const reticleOpacity = useTransform(smooth, [0.25, 0.8], [0, 1])
  const reticleScale = useTransform(smooth, [0.25, 0.8], [0.75, 1.05])

  return (
    <section id="home" className="hero" ref={containerRef}>
      {/* Dynamic Road Background */}
      <motion.div
        className="hero-image"
        style={{
          backgroundImage: `url(${heroRoadImage})`,
          scale: roadScale,
          y: roadY,
          filter: roadFilter,
        }}
      />
      <div className="hero-wash" />
      <div className="hero-road-lines" />

      {/* Road Continuity HUD overlay: Target lock reticle on pothole */}
      <motion.div
        className="hero-pothole-reticle"
        style={{
          opacity: reticleOpacity,
          scale: reticleScale,
        }}
        aria-hidden="true"
      >
        <div className="reticle-box">
          <span className="reticle-corner tl" />
          <span className="reticle-corner tr" />
          <span className="reticle-corner bl" />
          <span className="reticle-corner br" />
          <div className="reticle-pulse" />
          <div className="reticle-badge">
            <span className="live-dot" />
            <span>AI LOCK · 62mm CAVITY DETECTED</span>
          </div>
        </div>
      </motion.div>

      {/* Hero Content */}
      <motion.div
        className="hero-content"
        style={{
          y: textY,
          opacity: textOpacity,
        }}
      >
        <p className="eyebrow light">
          <span /> AI-powered street intelligence
        </p>
        <h1 className="hero-title">
          SAFER ROADS
          <br />
          BRIGHTER
          <br />
          <em>TOMORROWS.</em>
        </h1>
        <div className="hero-bottom">
          <div>
            <p className="hero-copy">
              RoadGuard turns every journey into street-level
              intelligence—detecting road damage and directing repairs where
              they matter most.
            </p>
            <div className="button-row">
              <ButtonLink
                onClick={(e) => {
                  e.preventDefault()
                  onOpenGlobe()
                }}
              >
                Report a pothole
              </ButtonLink>
              <ButtonLink href="#risk-map" variant="secondary">
                Explore the map
              </ButtonLink>
            </div>
          </div>

          {/* Compact Telemetry Chip */}
          <div className="damage-card glass desktop-only">
            <div className="card-top">
              <span>SCAN FEED · LIVE</span>
              <span className="live-pulse-badge">CONNECTED</span>
            </div>
            <div className="telemetry-row">
              <div>
                <small>SURFACE SPEED</small>
                <strong>48 KM/H</strong>
              </div>
              <div>
                <small>INFERENCE</small>
                <strong className="text-vermilion">14ms</strong>
              </div>
              <div>
                <small>ROAD PROFILE</small>
                <strong>ASPHALT D-1</strong>
              </div>
            </div>
            <div className="telemetry-bar">
              <div className="telemetry-fill" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Road Journey Progress Cue */}
      <div className="hero-journey-indicator">
        <span className="journey-line" />
        <span className="journey-label">CONTINUOUS STREET SCAN</span>
      </div>

      <a className="scroll-cue" href="#detection">
        SCROLL TO SCAN <ArrowDownRight size={18} />
      </a>
    </section>
  )
}

/* =========================================================================
   01 / DETECTION: Zoom into asphalt, reveal vermilion frames & analysis
   ========================================================================= */
function Detection() {
  const containerRef = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
  })

  // Deep macro zoom into asphalt texture
  const scale = useTransform(smooth, [0, 0.5, 1], [1.18, 1.04, 1.0])
  const y = useTransform(smooth, [0, 1], [-40, reduce ? 0 : 50])
  const overlayY = useTransform(smooth, [0, 1], [30, -25])

  return (
    <section
      id="detection"
      className="detection section-dark"
      ref={containerRef}
    >
      <div className="section-grid section-heading">
        <div>
          <p className="eyebrow light">
            <span /> 01 / Detection
          </p>
          <DottedTitle>
            SEE THE DAMAGE.
            <br />
            UNDERSTAND
            <br />
            THE <em>RISK.</em>
          </DottedTitle>
        </div>
        <p className="section-copy">
          Computer vision reads the road in real time—measuring surface loss,
          crack spread and danger to every rider.
        </p>
      </div>

      <div className="scan-stage">
        {/* Close-up asphalt pavement background */}
        <motion.div
          className="scan-stage-image"
          style={{
            backgroundImage: `url(${detectionAsphaltImage})`,
            scale,
            y,
          }}
        />
        <div className="scan-grid" />
        <div className="scan-vignette" />
        <div className="scan-laser-line" />

        {/* Animated Vermilion Detection Frame A: Pothole Cavity */}
        <motion.div
          className="detect-box box-a"
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ amount: 0.35 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ y: overlayY }}
        >
          <div className="detect-scanner-sweep" />
          <div className="detect-header">
            <span className="detect-badge">POTHOLE · 98.4%</span>
            <span className="detect-code">ID: CAV-049</span>
          </div>
          <div className="detect-measurements">
            <div>
              <span>DEPTH</span>
              <strong>62mm</strong>
            </div>
            <div>
              <span>VOLUME</span>
              <strong>14.2L</strong>
            </div>
            <div>
              <span>SEVERITY</span>
              <strong className="text-vermilion">CRITICAL</strong>
            </div>
          </div>
        </motion.div>

        {/* Animated Detection Frame B: Crack propagation */}
        <motion.div
          className="detect-box box-b"
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ amount: 0.35 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="detect-header">
            <span className="detect-badge">LONGITUDINAL CRACK · 91%</span>
            <span className="detect-code">ID: CRK-182</span>
          </div>
          <div className="detect-measurements">
            <div>
              <span>SPREAD</span>
              <strong>1.4m</strong>
            </div>
            <div>
              <span>WIDTH</span>
              <strong>18mm</strong>
            </div>
            <div>
              <span>RISK</span>
              <strong className="text-amber">MODERATE</strong>
            </div>
          </div>
        </motion.div>

        {/* Compact AI analysis floating panel */}
        <motion.div
          className="detection-telemetry-panel glass"
          initial={{ opacity: 0, x: 25 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ amount: 0.4 }}
          transition={{ duration: 0.7 }}
        >
          <div className="telemetry-title">
            <Activity size={14} className="text-vermilion" />
            <span>AI ROAD DIAGNOSTICS</span>
          </div>
          <div className="telemetry-stat">
            <label>SURFACE LOSS RATIO</label>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: "74%" }} />
            </div>
            <span>18.4% of scanned lane meter</span>
          </div>
          <div className="telemetry-meta">
            <span>BITUMEN: VG-30 (IRC)</span>
            <span>MUNICIPAL: MCGM MUMBAI</span>
          </div>
          <div className="telemetry-meta" style={{ marginTop: 6, paddingTop: 6 }}>
            <span>EDGE INFERENCE: 11.4ms</span>
            <span>MODEL: RoadNet-v4.2 CV</span>
          </div>
        </motion.div>

        {/* Bottom Scan Readout Bar */}
        <div className="scan-readout glass">
          <div className="readout-group">
            <span className="readout-indicator" />
            <span>FRAME 00482 · MCGM WESTERN EXPRESS HIGHWAY · WARD K/E</span>
          </div>
          <span>LAT 19.0760° N, 72.8777° E (MUMBAI)</span>
          <span>OPTICAL FLOW: ACTIVE</span>
          <span className="status-analyzing">AI ANALYSING</span>
        </div>
      </div>
    </section>
  )
}

/* =========================================================================
   02 / RISK MAP: Transition road perspective to elevated 3D city map
   ========================================================================= */
/* =========================================================================
   02 / RISK MAP: Real Interactive 2D Map with Live Pothole Reports & Scans
   ========================================================================= */
function RiskMap({
  onSelectIssueForGlobe,
  onOpenDetails,
  onOpenTriage,
}: {
  onSelectIssueForGlobe: (issue: any) => void
  onOpenDetails: (issueId: string) => void
  onOpenTriage: () => void
}) {
  const [filter, setFilter] = useState("all")

  // Real issues from RoadGuard municipal database
  const allIssues = useMemo(() => {
    return RoadIssueService.getAllIssues()
  }, [])

  const shown = useMemo(() => {
    if (filter === "high") {
      return allIssues.filter(
        (i) =>
          i.severity === "critical" ||
          i.severity === "high" ||
          (i.risk && i.risk.score >= 70)
      )
    }
    if (filter === "resolved") {
      return allIssues.filter(
        (i) =>
          i.status === "verified_repaired" ||
          i.status === "repair_completed" ||
          i.status === "closed"
      )
    }
    return allIssues
  }, [allIssues, filter])

  const [selected, setSelected] = useState<RoadIssue>(() => {
    return (
      allIssues.find((i) => i.severity === "critical") ||
      allIssues[0] || {
        id: "RG-25388",
        trackingCode: "CAV-049",
        title: "Large Void Under Asphalt on City Road",
        category: "cavity",
        severity: "critical",
        status: "reported",
        coordinates: { lat: 19.0544, lng: 72.8267 },
        address: "Bandstand Promenade, Bandra West, Mumbai",
        originalPhotoUrl: "",
        detection: {
          engine: "edge_cv",
          category: "cavity",
          confidence: 0.98,
          boxes: [],
          surfaceLossRatio: 0.18,
          depthEstimateMm: 70,
          severity: "critical",
          originalImageUrl: "",
          annotatedImageUrl: "",
        },
        risk: {
          score: 95,
          level: "critical",
          factors: {
            damageSeverity: 95,
            trafficVolume: 80,
            roadClass: 85,
            speedLimit: 60,
            proximityToHazards: 75,
            weatherVulnerability: 80,
            citizenReportsCount: 1,
          },
          weights: {
            damageSeverity: 0.35,
            trafficVolume: 0.2,
            roadClass: 0.15,
            speedLimit: 0.1,
            proximityToHazards: 0.1,
            weatherVulnerability: 0.05,
            citizenReportsCount: 0.05,
          },
          weightedContributions: {
            damageSeverity: 33.25,
            trafficVolume: 16,
            roadClass: 12.75,
            speedLimit: 6,
            proximityToHazards: 7.5,
            weatherVulnerability: 4,
            citizenReportsCount: 0.05,
          },
          explanation:
            "Dangerous subsidence creating large impact shock for passing vehicles.",
        },
        supportingReports: [],
        supportingCount: 1,
        statusHistory: [],
        repair: { verificationPercentage: 0, passesMinimumThreshold: false },
        createdAt: new Date().toISOString(),
      }
    )
  })

  // Synchronize selection if current selection is excluded by filter
  useEffect(() => {
    if (shown.length > 0 && !shown.some((i) => i.id === selected.id)) {
      setSelected(shown[0])
    }
  }, [shown, selected.id])

  const containerRef = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  // Scroll linked 3D elevation tilt: lifts from road plane to bird's eye
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const smooth = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 26,
  })

  const mapRotateX = useTransform(smooth, [0, 0.5, 1], [
    reduce ? 0 : 8,
    0,
    reduce ? 0 : -4,
  ])
  const mapScale = useTransform(smooth, [0, 0.5, 1], [0.98, 1, 0.99])

  return (
    <section id="risk-map" className="map-section" ref={containerRef}>
      <div className="section-grid section-heading ink">
        <div>
          <p className="eyebrow">
            <span /> 02 / Risk map
          </p>
          <DottedTitle>
            EVERY ROAD TELLS
            <br />A DIFFERENT <em>STORY.</em>
          </DottedTitle>
        </div>
        <p className="section-copy">
          One live picture of city-wide road health helps crews see patterns,
          compare risk and choose the smartest route.
        </p>
      </div>

      <Reveal className="map-wrap">
        <div className="map-header-row">
          <div className="map-toolbar">
            {[
              ["all", "All issues", allIssues.length],
              [
                "high",
                "High priority",
                allIssues.filter(
                  (i) =>
                    i.severity === "critical" ||
                    i.severity === "high" ||
                    (i.risk && i.risk.score >= 70)
                ).length,
              ],
              [
                "resolved",
                "Resolved",
                allIssues.filter(
                  (i) =>
                    i.status === "verified_repaired" ||
                    i.status === "repair_completed" ||
                    i.status === "closed"
                ).length,
              ],
            ].map(([value, label, count]) => (
              <button
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value as string)}
                key={value as string}
                aria-pressed={filter === value}
              >
                <span>{label}</span>
                <span className="count-pill">{count}</span>
              </button>
            ))}
          </div>

          <div className="map-view-legend desktop-only">
            <span className="legend-item">
              <span className="legend-dot high" /> Critical Scan
            </span>
            <span className="legend-item">
              <span
                className="legend-dot open"
                style={{ background: "#E69D36" }}
              />{" "}
              Monitored Scan
            </span>
            <span className="legend-item">
              <span className="legend-dot resolved" /> Repaired & Safe
            </span>
          </div>
        </div>

        {/* 3D Elevated Map Stage with Interactive 2D Map */}
        <motion.div
          className="city-map elevated-3d"
          style={{
            rotateX: mapRotateX,
            scale: mapScale,
          }}
          aria-label="Interactive 2D city road risk map with live pothole scan layers"
        >
          {/* Live Real 2D Map with WebGL/Canvas 60fps concentric scan circles and radar sweep */}
          <Interactive2DMap
            issues={shown}
            selectedIssueId={selected?.id}
            onSelectIssue={(issue) => setSelected(issue)}
            initialCenter={
              selected?.coordinates || { lat: 19.0544, lng: 72.8267 }
            }
            initialZoom={13}
            height="100%"
            className="w-full h-full"
            enableCircleScans={true}
            showRadarSweep={true}
            showControls={true}
            showLayerToggle={true}
            presetButtons={false}
          />

          {/* Floating Glassmorphic Risk Detail Card */}
          <AnimatePresence mode="wait">
            <motion.aside
              key={selected.id}
              className="risk-panel glass"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="risk-panel-top">
                <span className="risk-tag">
                  <span
                    className={`status-pill ${
                      selected.severity === "critical"
                        ? "high"
                        : selected.status === "verified_repaired" ||
                          selected.status === "closed"
                        ? "resolved"
                        : "open"
                    }`}
                  />
                  {selected.trackingCode || selected.id} · RISK SIGNAL
                </span>
                <span className="risk-coords">
                  {selected.coordinates
                    ? `${selected.coordinates.lat.toFixed(4)}°N, ${selected.coordinates.lng.toFixed(4)}°E`
                    : "19.0544°N, 72.8267°E"}
                </span>
              </div>

              <h3>{selected.title}</h3>
              <p className="risk-street">
                <MapPin size={15} /> {selected.address}
              </p>

              <div className="risk-score">
                <strong>
                  {selected.risk?.score
                    ? (selected.risk.score / 10).toFixed(1)
                    : selected.severity === "critical"
                    ? "9.5"
                    : "6.5"}
                </strong>
                <span>
                  /10
                  <br />
                  priority score
                </span>
              </div>

              <div className="risk-details-compact">
                <div>
                  <small>DEPTH</small>
                  <span>{selected.detection?.depthEstimateMm || 70}mm</span>
                </div>
                <div>
                  <small>TRAFFIC IMPACT</small>
                  <span>
                    {selected.risk?.explanation ||
                      selected.risk?.recommendedAction ||
                      "Suspension hazard / MCGM transit corridor"}
                  </span>
                </div>
              </div>

              <div className="risk-cta-group">
                <button
                  className="risk-cta"
                  onClick={() => onSelectIssueForGlobe(selected)}
                >
                  <span>Inspect on 3D Globe</span>
                  <Globe size={15} />
                </button>
                <button
                  className="risk-cta-secondary glass"
                  onClick={() => onOpenDetails(selected.id)}
                >
                  <span>Review Verification & Risk</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </motion.aside>
          </AnimatePresence>

          <div className="map-compass glass">
            <Navigation size={18} />
            <span>MUMBAI · 19°N</span>
          </div>

          <div className="map-scale-metric glass desktop-only">
            <span>MCGM TELEMETRY GRID 1:5000</span>
          </div>
        </motion.div>
      </Reveal>
    </section>
  )
}

/* =========================================================================
   03 / REPAIR: Follow road into repair scene, damaged vs repaired split
   ========================================================================= */
function RepairJourney() {
  const [step, setStep] = useState(3)
  const [sliderPos, setSliderPos] = useState(75)
  const [isDragging, setIsDragging] = useState(false)
  const visualRef = useRef<HTMLDivElement>(null)

  const stages = [
    {
      title: "Citizen Geotagged Report",
      time: "Bandra West · Ward H/W",
      desc: "Verified citizen GPS hazard report submitted via RoadGuard",
    },
    {
      title: "Edge AI CV Verification",
      time: "Automated Scan · 12ms",
      desc: "3D cavity volume, 70mm depth & VG-30 bitumen loss calculated",
    },
    {
      title: "MCGM Work Order Dispatched",
      time: "Crew WO-25388 Dispatched",
      desc: "Hot-mix rapid response asphalt crew assigned by District Chief",
    },
    {
      title: "Repaired & Certified Safe",
      time: "Quality Inspected",
      desc: "Pristine IRC:SP:98-2020 asphalt restoration verified by Vision AI",
    },
  ]

  // Sync step to split view slider position
  const handleStepClick = (index: number) => {
    setStep(index)
    const targetPercentages = [15, 38, 68, 98]
    setSliderPos(targetPercentages[index])
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    updateSlider(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    updateSlider(e.clientX)
  }

  const handlePointerUp = () => {
    setIsDragging(false)
  }

  const updateSlider = (clientX: number) => {
    if (!visualRef.current) return
    const rect = visualRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const percent = (x / rect.width) * 100
    setSliderPos(percent)

    if (percent < 25) setStep(0)
    else if (percent < 50) setStep(1)
    else if (percent < 80) setStep(2)
    else setStep(3)
  }

  return (
    <section id="repair" className="repair section-dark">
      <div className="section-grid section-heading">
        <div>
          <p className="eyebrow light">
            <span /> 03 / Resolution
          </p>
          <DottedTitle>
            FROM REPORT
            <br />
            TO <em>REPAIR.</em>
          </DottedTitle>
        </div>
        <p className="section-copy">
          A transparent journey from first evidence to verified repair—with
          every handoff visible.
        </p>
      </div>

      <div className="repair-layout">
        {/* Interactive Repair Timeline */}
        <div className="timeline">
          {stages.map((stage, index) => (
            <button
              key={stage.title}
              className={`timeline-step ${index <= step ? "complete" : ""} ${index === step ? "is-current" : ""
                }`}
              onClick={() => handleStepClick(index)}
              aria-label={`Step ${index + 1}: ${stage.title}`}
            >
              <span className="step-badge">
                {index < step ? <Check size={16} /> : `0${index + 1}`}
              </span>
              <div className="step-info">
                <strong>{stage.title}</strong>
                <small className="step-time">{stage.time}</small>
                <p className="step-desc desktop-only">{stage.desc}</p>
              </div>
            </button>
          ))}
          <div className="timeline-line">
            <motion.span
              animate={{ height: `${(step / 3) * 100}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 24 }}
            />
          </div>
        </div>

        {/* Interactive Damaged vs Repaired Visual Comparison */}
        <div
          className="repair-visual glass"
          ref={visualRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Repaired Flawless Asphalt Road (After) */}
          <img
            src={repairedRoadImage}
            alt="Smooth pristine urban asphalt road after full resurfacing at golden hour"
            loading="lazy"
            className="repaired-image-base"
          />

          {/* Damaged Road Layer with Variable Split (Before) */}
          <motion.div
            className="damage-half"
            animate={{ width: `${100 - sliderPos}%` }}
            transition={
              isDragging
                ? { duration: 0 }
                : { type: "spring", stiffness: 120, damping: 25 }
            }
            style={{
              backgroundImage: `url(${detectionAsphaltImage})`,
            }}
          >
            <div className="before-tag">BEFORE · POTHOLE CAVITY (70mm)</div>
          </motion.div>

          <div className="after-tag">AFTER · MCGM HOT-MIX RESTORED</div>

          {/* Interactive Split Divider Handle */}
          <motion.div
            className="slider-divider"
            animate={{ left: `${100 - sliderPos}%` }}
            transition={
              isDragging
                ? { duration: 0 }
                : { type: "spring", stiffness: 120, damping: 25 }
            }
          >
            <div className="slider-handle">
              <SlidersHorizontal size={14} />
            </div>
          </motion.div>

          {/* Verified Repair Badge */}
          <motion.div
            className="verified glass"
            animate={{
              opacity: step === 3 ? 1 : 0.6,
              scale: step === 3 ? 1 : 0.95,
            }}
          >
            <ShieldCheck size={26} className="verified-icon" />
            <div>
              <strong>MCGM QUALITY CERTIFIED</strong>
              <small>RoadGuard vision check · 100% Surface Match (IRC:SP:98)</small>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* =========================================================================
   04 / IMPACT: Camera pulls back to wide city panorama & reveals metrics
   ========================================================================= */
function Impact() {
  const containerRef = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  })

  const smooth = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 26,
  })

  const panoramaScale = useTransform(smooth, [0, 1], [1.14, reduce ? 1 : 1.0])
  const panoramaY = useTransform(smooth, [0, 1], [-35, reduce ? 0 : 35])

  const metrics = [
    ["24,821", "Reports received", "+18% this month"],
    ["18,406", "Repairs completed", "Verified in 48h"],
    ["2.4 days", "Avg. response time", "-42% vs baseline"],
    ["24", "MCGM Municipal Wards", "Active Greater Mumbai Pilot"],
  ]

  return (
    <section id="impact" className="impact" ref={containerRef}>
      <p className="eyebrow">
        <span /> 04 / Shared impact
      </p>
      <DottedTitle>
        SMALL REPORTS.
        <br />
        BETTER <em>CITIES.</em>
      </DottedTitle>
      <p className="demo-label">ALL FIGURES SHOWN ARE DEMO DATA</p>

      {/* Metrics Grid with Subtle Scroll Depth */}
      <div className="metrics">
        {metrics.map(([value, label, delta], index) => (
          <motion.div
            key={label}
            className="metric-card glass"
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{
              delay: index * 0.12,
              duration: 0.65,
              ease: [0.22, 1, 0.36, 1],
            }}
            viewport={{ once: true }}
            whileHover={{ y: -4 }}
          >
            <div className="metric-header">
              <span>0{index + 1}</span>
              <span className="metric-delta">{delta}</span>
            </div>
            <strong>{value}</strong>
            <p>{label}</p>
          </motion.div>
        ))}
      </div>

      {/* Wide City Panorama Showcase Container */}
      <div className="impact-photo-frame glass">
        <motion.div
          className="impact-photo"
          style={{
            backgroundImage: `url(${cityPanoramaImage})`,
            scale: panoramaScale,
            y: panoramaY,
          }}
        />
        <div className="impact-photo-wash" />
        <div className="impact-caption">
          <span className="eyebrow light">
            <span /> ONE CITY AT A TIME
          </span>
          <p>Cleaner routes. Faster repairs. Safer journeys.</p>
        </div>
      </div>
    </section>
  )
}

/* =========================================================================
   05 / COMMUNITY: Final city perspective & quick report strip
   ========================================================================= */
function Community({ onOpenGlobe }: { onOpenGlobe: () => void }) {
  return (
    <section id="community" className="community">
      <div className="community-copy">
        <p className="eyebrow light">
          <span /> 05 / Your city
        </p>
        <DottedTitle>
          BETTER ROADS
          <br />
          FOR <em>INDIA.</em>
        </DottedTitle>
        <p>
          See a road hazard in your ward? One verified geotagged report alerts
          MCGM engineers, dispatches rapid repair crews, and protects thousands
          of daily commuters across India.
        </p>
        <div className="button-row">
          <ButtonLink
            onClick={(e) => {
              e.preventDefault()
              onOpenGlobe()
            }}
          >
            Report a pothole
          </ButtonLink>
          <ButtonLink href="#risk-map" variant="dark">
            Open live risk map
          </ButtonLink>
        </div>
      </div>

      {/* Connected Road Gallery showing the full journey */}
      <div className="road-gallery">
        <div className="gallery-item">
          <img
            src={heroRoadImage}
            alt="Urban asphalt road in golden hour city light"
            loading="lazy"
          />
          <span className="gallery-tag">01 · SCAN (AI Cavity Detection)</span>
        </div>
        <div className="gallery-item">
          <img
            src={repairedRoadImage}
            alt="Smooth resurfaced city road at sunset"
            loading="lazy"
          />
          <span className="gallery-tag">02 · RESTORE (MCGM Hot-Mix Quality)</span>
        </div>
        <div className="gallery-item">
          <img
            src={cityPanoramaImage}
            alt="Wide city road network flowing safely"
            loading="lazy"
          />
          <span className="gallery-tag">03 · CONNECT (Smart City Corridors)</span>
        </div>
      </div>

      {/* Quick Report Strip with 3D Globe Action */}
      <div id="report" className="report-strip glass">
        <div className="report-icon-wrap">
          <MapPin size={28} />
        </div>
        <div className="report-text">
          <strong>SPOT IT. PIN IT. RESOLVE IT.</strong>
          <small>
            Greater Mumbai (MCGM) & Smart Cities Mission · Less than 60 seconds.
          </small>
        </div>
        <button
          onClick={onOpenGlobe}
          className="report-button"
          title="Open interactive 3D Globe"
        >
          <Globe size={16} />
          <span>Select on 3D Globe</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  )
}

/* =========================================================================
   FOOTER: Consistent editorial closure with smooth top return
   ========================================================================= */
function Footer({ onOpenGlobe }: { onOpenGlobe: () => void }) {
  return (
    <footer>
      <div className="footer-top">
        <div className="footer-brand-col">
          <a href="#home" className="brand footer-brand">
            <span className="brand-mark">
              <span />
            </span>
            <span>
              ROADGUARD<sup>AI</sup>
            </span>
          </a>
          <p>Street intelligence for safer, more responsive cities.</p>
        </div>

        <div className="footer-links-col">
          <span className="footer-col-title">NAVIGATION</span>
          <div className="footer-links">
            <a href="#home">Home</a>
            <a href="#detection">How it works</a>
            <a href="#risk-map">Risk map</a>
            <a href="#repair">Resolution</a>
            <a href="#impact">Impact</a>
            <a href="#community">About</a>
          </div>
        </div>

        <div className="footer-contact-col">
          <span className="footer-col-title">COMMUNITY</span>
          <p>
            Collaborating with MCGM, Smart Cities Mission, engineers, and citizens across India.
          </p>
          <button
            onClick={onOpenGlobe}
            className="footer-sub-link"
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Launch 3D Globe Location Picker →
          </button>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 ROADGUARD AI · CONCEPT EXPERIENCE</span>
        <span>PRIVACY · ACCESSIBILITY · SYSTEM STATUS: OPTIMAL</span>
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: "smooth" })
          }}
        >
          BACK TO TOP ↑
        </a>
      </div>
    </footer>
  )
}

/* =========================================================================
   APP ROOT: Active section spy, 3D Globe picker & Pothole report modal
   ========================================================================= */
export default function App() {
  const [active, setActive] = useState("home")
  const [isGlobeOpen, setIsGlobeOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isTriageOpen, setIsTriageOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null)

  // Live Road Issues, Authenticated Session and Active Role
  const [issues, setIssues] = useState<RoadIssue[]>(() =>
    RoadIssueService.initialize(),
  )
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("citizen")
  const [selectedIssueForDrawer, setSelectedIssueForDrawer] =
    useState<RoadIssue | null>(null)
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const [selectedIssueForWorkspace, setSelectedIssueForWorkspace] =
    useState<RoadIssue | null>(null)

  const refreshIssues = async () => {
    try {
      const live = await RoadIssueService.fetchLiveIssues()
      setIssues(live)
    } catch {
      setIssues(RoadIssueService.getAllIssues())
    }
  }

  // 1-Click Fast Persona Switcher
  const handleSwitchPersona = async (personaRoleOrEmail: string) => {
    const target = MUNICIPAL_PERSONAS.find(
      (p) =>
        p.role === personaRoleOrEmail ||
        p.email === personaRoleOrEmail ||
        p.id === personaRoleOrEmail ||
        p.name.toLowerCase().includes(personaRoleOrEmail.toLowerCase()),
    )
    if (!target) return
    try {
      const user = await apiClient.auth.login({
        email: target.email,
        password: target.password,
      })
      setCurrentUser(user)
      setCurrentUserRole(mapBackendRole(user.role))
      localStorage.setItem("roadguard_active_persona", target.role)
      refreshIssues()
    } catch {
      const mockUser: ApiUser = {
        id: target.id,
        email: target.email,
        fullName: target.name,
        role: target.role,
        departmentId:
          target.role === "DEPARTMENT_ADMIN"
            ? "40947e83-f3ca-47b9-bdef-0cfd8175555b"
            : undefined,
      }
      setCurrentUser(mockUser)
      setCurrentUserRole(mapBackendRole(target.role))
      localStorage.setItem("roadguard_active_persona", target.role)
      refreshIssues()
    }
  }

  // Load active session and fetch live database records on mount
  useEffect(() => {
    async function initSessionAndIssues() {
      const savedPersona = localStorage.getItem("roadguard_active_persona")
      if (savedPersona) {
        const found = MUNICIPAL_PERSONAS.find((p) => p.role === savedPersona)
        if (found) {
          try {
            const user = await apiClient.auth.login({
              email: found.email,
              password: found.password,
            })
            setCurrentUser(user)
            setCurrentUserRole(mapBackendRole(user.role))
          } catch {
            const mockUser: ApiUser = {
              id: found.id,
              email: found.email,
              fullName: found.name,
              role: found.role,
              departmentId:
                found.role === "DEPARTMENT_ADMIN"
                  ? "40947e83-f3ca-47b9-bdef-0cfd8175555b"
                  : undefined,
            }
            setCurrentUser(mockUser)
            setCurrentUserRole(mapBackendRole(found.role))
          }
        }
      } else {
        try {
          const user = await apiClient.auth.getMe()
          if (user) {
            setCurrentUser(user)
            setCurrentUserRole(mapBackendRole(user.role))
          }
        } catch {
          // Default unauthenticated visitor is a citizen observer
        }
      }

      try {
        const live = await RoadIssueService.fetchLiveIssues()
        if (live && live.length > 0) {
          setIssues(live)
        }
      } catch (err) {
        console.warn("RoadGuard: Using local issues fallback:", err)
      }
    }

    initSessionAndIssues()
  }, [])

  const handleUserChange = (user: ApiUser | null) => {
    setCurrentUser(user)
    if (user) {
      setCurrentUserRole(mapBackendRole(user.role))
      localStorage.setItem("roadguard_active_persona", user.role)
    } else {
      setCurrentUserRole("citizen")
      localStorage.removeItem("roadguard_active_persona")
    }
    refreshIssues()
  }

  // Unified Entry Point: Start Reporting from any CTA
  const handleStartReporting = () => {
    setIsGlobeOpen(false)
    setIsReportModalOpen(true)
  }

  // Open 3D Globe
  const handleOpenGlobe = () => {
    setIsReportModalOpen(false)
    setIsGlobeOpen(true)
  }

  // Called when user selects & confirms location on 3D globe
  const handleConfirmLocation = (location: SelectedLocation) => {
    setSelectedLocation(location)
    setIsGlobeOpen(false)
    setIsReportModalOpen(true)
  }

  // Inspect existing map issue on globe
  const handleSelectIssueForGlobe = (issue: any) => {
    if (issue.coordinates) {
      setSelectedLocation({
        lat: issue.coordinates.lat,
        lng: issue.coordinates.lng,
        address: `${issue.street || issue.address}, Mumbai`,
      })
    }
    setIsGlobeOpen(true)
  }

  // Inspect rich issue details drawer
  const handleOpenIssueDetails = (issueOrId: RoadIssue | string) => {
    let target: RoadIssue | undefined
    if (typeof issueOrId === "string") {
      target = RoadIssueService.getIssueById(issueOrId)
    } else {
      target = issueOrId
    }
    if (target) {
      setSelectedIssueForDrawer(target)
      setIsDrawerOpen(true)
    }
  }

  // Called when an issue is updated via state machine or support
  const handleIssueUpdated = (updated: RoadIssue) => {
    refreshIssues()
    setSelectedIssueForDrawer(updated)
    setSelectedIssueForWorkspace(updated)
  }

  // URL Routing: /manage/issues/:issueId
  useEffect(() => {
    const checkPathForWorkspace = () => {
      const match = window.location.pathname.match(/\/manage\/issues\/([^/?#]+)/)
      if (match) {
        const issueCodeOrId = decodeURIComponent(match[1]).trim()
        const found = issues.find(
          (i) =>
            i.trackingCode.toLowerCase() === issueCodeOrId.toLowerCase() ||
            i.id.toLowerCase() === issueCodeOrId.toLowerCase(),
        )
        if (found) {
          setSelectedIssueForWorkspace(found)
          setIsWorkspaceOpen(true)
          setIsTriageOpen(false)
          setIsDrawerOpen(false)
        } else {
          apiClient.issues
            .getById(issueCodeOrId)
            .then((mapped) => {
              if (mapped) {
                setSelectedIssueForWorkspace(mapped)
                setIsWorkspaceOpen(true)
                setIsTriageOpen(false)
                setIsDrawerOpen(false)
              }
            })
            .catch(() => { })
        }
      } else {
        setIsWorkspaceOpen(false)
      }
    }
    checkPathForWorkspace()
    window.addEventListener("popstate", checkPathForWorkspace)
    return () => window.removeEventListener("popstate", checkPathForWorkspace)
  }, [issues])

  const handleCloseWorkspace = () => {
    setIsWorkspaceOpen(false)
    if (window.location.pathname.startsWith("/manage/issues/")) {
      window.history.pushState(null, "", "/")
    }
  }

  const handleBackToTriage = () => {
    setIsWorkspaceOpen(false)
    if (window.location.pathname.startsWith("/manage/issues/")) {
      window.history.pushState(null, "", "/")
    }
    setIsTriageOpen(true)
  }

  useEffect(() => {
    const sections = [
      "home",
      "detection",
      "risk-map",
      "repair",
      "impact",
      "community",
    ]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[]

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActive(entry.target.id)
          }
        })
      },
      { rootMargin: "-35% 0px -45% 0px" },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="roadguard-app">
      {/* WCAG 2.2 AA Keyboard Bypass Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-slate-950 focus:rounded-lg focus:font-semibold focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        Skip to main content
      </a>
      <Header
        active={active}
        onOpenGlobe={handleStartReporting}
        onOpenTriage={() => setIsTriageOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        issuesCount={issues.length}
        currentUser={currentUser}
      />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <Hero onOpenGlobe={handleStartReporting} />
        <Detection />
        <RiskMap
          onSelectIssueForGlobe={handleSelectIssueForGlobe}
          onOpenDetails={handleOpenIssueDetails}
          onOpenTriage={() => setIsTriageOpen(true)}
        />
        <RepairJourney />
        <Impact />
        <Community onOpenGlobe={handleStartReporting} />
      </main>
      <Footer onOpenGlobe={handleStartReporting} />

      {/* Full-Screen Interactive 3D Earth Globe Location Picker */}
      {isGlobeOpen && (
        <Suspense
          fallback={
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Loading 3D Globe"
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-white"
            >
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                <Globe className="w-8 h-8 text-amber-400 absolute" />
              </div>
              <p className="mt-4 text-sm font-semibold tracking-wide text-slate-200">
                Initializing 3D Geospatial Earth Globe...
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Streaming satellite imagery &amp; Cesium terrain tiles
              </p>
            </div>
          }
        >
          <GlobeLocationPicker
            isOpen={isGlobeOpen}
            onClose={() => setIsGlobeOpen(false)}
            onConfirmLocation={handleConfirmLocation}
            initialLocation={
              selectedLocation
                ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
                : undefined
            }
            issues={issues}
            onSelectIssue={(issue) => {
              setSelectedIssueForDrawer(issue)
              setIsDrawerOpen(true)
            }}
          />
        </Suspense>
      )}

      {/* Pothole Report Telemetry Modal with AI Road Inspector & Risk Engine */}
      <PotholeReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        location={selectedLocation}
        onOpenGlobe={handleOpenGlobe}
        onUpdateLocation={setSelectedLocation}
        onReportCreated={(newIssue) => {
          refreshIssues()
          setSelectedIssueForDrawer(newIssue)
        }}
      />

      {/* City Risk & Triage Operations Dashboard */}
      <CityTriageDashboard
        isOpen={isTriageOpen}
        onClose={() => setIsTriageOpen(false)}
        issues={issues}
        currentUserRole={currentUserRole}
        onRoleChange={setCurrentUserRole}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSwitchPersona={handleSwitchPersona}
        onSelectIssue={(issue) => {
          setIsTriageOpen(false)
          setIsDrawerOpen(false)
          setSelectedIssueForWorkspace(issue)
          setIsWorkspaceOpen(true)
          const targetUrl = `/manage/issues/${issue.trackingCode || issue.id}`
          if (window.location.pathname !== targetUrl) {
            window.history.pushState(null, "", targetUrl)
          }
        }}
        onOpenGlobeForIssue={(issue) => {
          setIsTriageOpen(false)
          handleSelectIssueForGlobe(issue)
        }}
        onOpenReportModal={() => {
          setIsTriageOpen(false)
          setIsReportModalOpen(true)
        }}
        onRefreshData={refreshIssues}
      />

      {/* Deep Incident Details, Explainable Risk & Repair Verification Drawer */}
      <IssueDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        issue={selectedIssueForDrawer}
        currentUserRole={currentUserRole}
        onRoleChange={setCurrentUserRole}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onIssueUpdated={handleIssueUpdated}
        onOpenWorkspace={(issue) => {
          setIsDrawerOpen(false)
          setIsTriageOpen(false)
          setSelectedIssueForWorkspace(issue)
          setIsWorkspaceOpen(true)
          const targetUrl = `/manage/issues/${issue.trackingCode || issue.id}`
          if (window.location.pathname !== targetUrl) {
            window.history.pushState(null, "", targetUrl)
          }
        }}
        onFlyToGlobe={(issue) => {
          setIsDrawerOpen(false)
          handleSelectIssueForGlobe(issue)
        }}
      />

      {/* Complete Dedicated Pothole Management Page / Workspace */}
      <IssueManagementWorkspace
        isOpen={isWorkspaceOpen}
        onClose={handleCloseWorkspace}
        onBackToTriage={handleBackToTriage}
        issue={selectedIssueForWorkspace}
        currentUserRole={currentUserRole}
        onRoleChange={setCurrentUserRole}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSwitchPersona={handleSwitchPersona}
        onIssueUpdated={handleIssueUpdated}
        onFlyToGlobe={(issue) => {
          setIsWorkspaceOpen(false)
          handleSelectIssueForGlobe(issue)
        }}
      />

      {/* Municipal Authentication & Pilot Profile Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onUserChange={handleUserChange}
      />

      {/* Offline / Legacy Report Migration Banner */}
      <SyncReportsBanner
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onSyncComplete={() => {
          refreshIssues()
        }}
      />
    </div>
  )
}
