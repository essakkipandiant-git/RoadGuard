import { useEffect, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import GlobeLocationPicker, { SelectedLocation } from "./components/GlobeLocationPicker";
import PotholeReportModal from "./components/PotholeReportModal";

// Continuous cinematic urban road visual assets (Golden-hour city asphalt journey)
const heroRoadImage = "/images/hero_road.jpg";
const detectionAsphaltImage = "/images/detection_asphalt.jpg";
const aerialGridImage = "/images/aerial_grid.jpg";
const repairedRoadImage = "/images/repaired_road.jpg";
const cityPanoramaImage = "/images/city_panorama.jpg";

const navItems = [
  ["Home", "home"],
  ["How It Works", "detection"],
  ["Risk Map", "risk-map"],
  ["Resolution", "repair"],
  ["Impact", "impact"],
  ["About", "community"],
];

type ButtonLinkProps = {
  href?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "dark";
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
};

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
    );
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
  );
}

function DottedTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={`dot-title ${className}`}>{children}</h2>;
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { once: true, margin: "-12%" });
  const reduce = useReducedMotion();
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
  );
}

function Header({
  active,
  onOpenGlobe,
}: {
  active: string;
  onOpenGlobe: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    return scrollY.on("change", (latest) => {
      setScrolled(latest > 60);
    });
  }, [scrollY]);

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
          <a
            className={active === id ? "active" : ""}
            href={`#${id}`}
            key={id}
          >
            {label}
          </a>
        ))}
      </nav>
      <ButtonLink
        onClick={(e) => {
          e.preventDefault();
          onOpenGlobe();
        }}
      >
        Report a pothole
      </ButtonLink>
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
            <ButtonLink
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                onOpenGlobe();
              }}
            >
              Report a pothole
            </ButtonLink>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/* =========================================================================
   00 / HERO: Continuous road approach — wide city view to pothole zoom
   ========================================================================= */
function Hero({ onOpenGlobe }: { onOpenGlobe: () => void }) {
  const containerRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  // Scroll linked forward progression
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 95,
    damping: 26,
    restDelta: 0.001,
  });

  // Approaching the visible pothole in the lower foreground
  const roadScale = useTransform(smooth, [0, 1], [1, reduce ? 1 : 1.32]);
  const roadY = useTransform(smooth, [0, 1], ["0%", reduce ? "0%" : "12%"]);
  const roadFilter = useTransform(
    smooth,
    [0, 1],
    ["contrast(1.08) brightness(0.96)", "contrast(1.15) brightness(0.9)"]
  );

  // Parallax on hero text and UI overlays
  const textY = useTransform(smooth, [0, 0.75], ["0%", reduce ? "0%" : "-26%"]);
  const textOpacity = useTransform(smooth, [0, 0.65], [1, reduce ? 1 : 0.15]);

  // Target lock reticle on the pothole as camera draws near
  const reticleOpacity = useTransform(smooth, [0.25, 0.8], [0, 1]);
  const reticleScale = useTransform(smooth, [0.25, 0.8], [0.75, 1.05]);

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
                  e.preventDefault();
                  onOpenGlobe();
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
  );
}

/* =========================================================================
   01 / DETECTION: Zoom into asphalt, reveal vermilion frames & analysis
   ========================================================================= */
function Detection() {
  const containerRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
  });

  // Deep macro zoom into asphalt texture
  const scale = useTransform(smooth, [0, 0.5, 1], [1.18, 1.04, 1.0]);
  const y = useTransform(smooth, [0, 1], [-40, reduce ? 0 : 50]);
  const overlayY = useTransform(smooth, [0, 1], [30, -25]);

  return (
    <section id="detection" className="detection section-dark" ref={containerRef}>
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
            <span>EDGE INFERENCE: 12.8ms</span>
            <span>MODEL: RoadNet-v4.2</span>
          </div>
        </motion.div>

        {/* Bottom Scan Readout Bar */}
        <div className="scan-readout glass">
          <div className="readout-group">
            <span className="readout-indicator" />
            <span>FRAME 00294</span>
          </div>
          <span>LAT 51.5074° N, 0.1278° W</span>
          <span>OPTICAL FLOW: ACTIVE</span>
          <span className="status-analyzing">AI ANALYSING</span>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   02 / RISK MAP: Transition road perspective to elevated 3D city map
   ========================================================================= */
const issues = [
  {
    id: 1,
    x: 24,
    y: 35,
    status: "high",
    title: "Critical pothole",
    street: "Harbour Ave",
    score: "8.9",
    depth: "62mm",
    impact: "Suspension hazard / 420 cars/hr",
    lat: "51.5082° N, 0.1245° W",
    coordinates: { lat: 51.5082, lng: -0.1245 },
  },
  {
    id: 2,
    x: 58,
    y: 57,
    status: "open",
    title: "Surface cracking",
    street: "Mason Street",
    score: "5.4",
    depth: "22mm",
    impact: "Water ingress / 180 cars/hr",
    lat: "51.5061° N, 0.1310° W",
    coordinates: { lat: 51.5061, lng: -0.1310 },
  },
  {
    id: 3,
    x: 74,
    y: 28,
    status: "resolved",
    title: "Edge failure",
    street: "North Loop",
    score: "0.8",
    depth: "Repaved",
    impact: "Restored & sealed 2 days ago",
    lat: "51.5120° N, 0.1190° W",
    coordinates: { lat: 51.5120, lng: -0.1190 },
  },
  {
    id: 4,
    x: 43,
    y: 76,
    status: "high",
    title: "Deep pothole",
    street: "Willow Road",
    score: "9.2",
    depth: "74mm",
    impact: "High-speed lane hazard / 610 cars/hr",
    lat: "51.5034° N, 0.1288° W",
    coordinates: { lat: 51.5034, lng: -0.1288 },
  },
];

function RiskMap({ onSelectIssueForGlobe }: { onSelectIssueForGlobe: (issue: any) => void }) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(issues[0]);
  const shown = issues.filter(
    (item) => filter === "all" || item.status === filter
  );

  const containerRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  // Scroll linked 3D elevation tilt: lifts from road plane to bird's eye
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 26,
  });

  const mapRotateX = useTransform(smooth, [0, 0.5, 1], [reduce ? 0 : 12, 0, reduce ? 0 : -6]);
  const mapScale = useTransform(smooth, [0, 0.5, 1], [0.96, 1, 0.98]);

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
              ["all", "All issues", issues.length],
              ["high", "High priority", issues.filter((i) => i.status === "high").length],
              ["resolved", "Resolved", issues.filter((i) => i.status === "resolved").length],
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
              <span className="legend-dot high" /> Critical
            </span>
            <span className="legend-item">
              <span className="legend-dot open" /> Monitored
            </span>
            <span className="legend-item">
              <span className="legend-dot resolved" /> Repaired
            </span>
          </div>
        </div>

        {/* 3D Elevated Map Stage */}
        <motion.div
          className="city-map elevated-3d"
          style={{
            rotateX: mapRotateX,
            scale: mapScale,
          }}
          aria-label="Interactive demo city road risk map"
        >
          {/* Real aerial city road network background */}
          <div
            className="map-aerial-bg"
            style={{ backgroundImage: `url(${aerialGridImage})` }}
          />
          <div className="map-grid-lines" />
          <div className="map-overlay-tint" />

          {/* Dynamic Road Arteries */}
          <div className="map-road road-one">
            <span className="artery-pulse" />
          </div>
          <div className="map-road road-two">
            <span className="artery-pulse" />
          </div>
          <div className="map-road road-three">
            <span className="artery-pulse" />
          </div>

          {/* Highlighted high-risk connected route */}
          <svg className="map-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path
              d="M 24 35 Q 34 55 43 76"
              className="route-path-line"
              fill="none"
              stroke="#e65336"
              strokeWidth="0.8"
              strokeDasharray="2 2"
            />
          </svg>

          {/* Interactive incident markers with pulsing waves */}
          {shown.map((issue) => (
            <motion.button
              key={issue.id}
              className={`map-marker ${issue.status} ${
                selected.id === issue.id ? "is-active" : ""
              }`}
              style={{ left: `${issue.x}%`, top: `${issue.y}%` }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.15 }}
              onClick={() => setSelected(issue)}
              aria-label={`${issue.title}, ${issue.street}`}
            >
              {selected.id === issue.id && <span className="marker-radar" />}
              <MapPin size={20} />
            </motion.button>
          ))}

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
                    className={`status-pill ${selected.status}`}
                  />
                  RISK SIGNAL
                </span>
                <span className="risk-coords">{selected.lat}</span>
              </div>

              <h3>{selected.title}</h3>
              <p className="risk-street">
                <MapPin size={15} /> {selected.street}
              </p>

              <div className="risk-score">
                <strong>{selected.score}</strong>
                <span>
                  /10
                  <br />
                  priority score
                </span>
              </div>

              <div className="risk-details-compact">
                <div>
                  <small>DEPTH</small>
                  <span>{selected.depth}</span>
                </div>
                <div>
                  <small>TRAFFIC IMPACT</small>
                  <span>{selected.impact}</span>
                </div>
              </div>

              <button
                className="risk-cta"
                onClick={() => onSelectIssueForGlobe(selected)}
              >
                <span>Inspect on 3D Globe</span>
                <Globe size={15} />
              </button>
            </motion.aside>
          </AnimatePresence>

          <div className="map-compass glass">
            <Navigation size={18} />
            <span>N 51°</span>
          </div>

          <div className="map-scale-metric glass desktop-only">
            <span>GRID SCALE 1:5000</span>
          </div>
        </motion.div>
      </Reveal>
    </section>
  );
}

/* =========================================================================
   03 / REPAIR: Follow road into repair scene, damaged vs repaired split
   ========================================================================= */
function RepairJourney() {
  const [step, setStep] = useState(3);
  const [sliderPos, setSliderPos] = useState(75);
  const [isDragging, setIsDragging] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);

  const stages = [
    { title: "Reported", time: "Today · 09:14", desc: "Hazard detected by fleet camera" },
    { title: "Under review", time: "Today · 10:02", desc: "Automated AI severity verification" },
    { title: "Assigned", time: "Tomorrow · 08:30", desc: "Work order scheduled with crew" },
    { title: "Repaired", time: "28 May · 16:45", desc: "Hot-mix asphalt laid & verified" },
  ];

  // Sync step to split view slider position
  const handleStepClick = (index: number) => {
    setStep(index);
    const targetPercentages = [15, 38, 68, 98];
    setSliderPos(targetPercentages[index]);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    updateSlider(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateSlider(e.clientX);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const updateSlider = (clientX: number) => {
    if (!visualRef.current) return;
    const rect = visualRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPos(percent);

    if (percent < 25) setStep(0);
    else if (percent < 50) setStep(1);
    else if (percent < 80) setStep(2);
    else setStep(3);
  };

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
          A transparent journey from first evidence to verified repair—with every
          handoff visible.
        </p>
      </div>

      <div className="repair-layout">
        {/* Interactive Repair Timeline */}
        <div className="timeline">
          {stages.map((stage, index) => (
            <button
              key={stage.title}
              className={`timeline-step ${index <= step ? "complete" : ""} ${
                index === step ? "is-current" : ""
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
            transition={isDragging ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 25 }}
            style={{
              backgroundImage: `url(${detectionAsphaltImage})`,
            }}
          >
            <div className="before-tag">BEFORE · DAMAGED</div>
          </motion.div>

          <div className="after-tag">AFTER · RESURFACED</div>

          {/* Interactive Split Divider Handle */}
          <motion.div
            className="slider-divider"
            animate={{ left: `${100 - sliderPos}%` }}
            transition={isDragging ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 25 }}
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
              <strong>REPAIR VERIFIED</strong>
              <small>RoadGuard vision check · 100% Surface Match</small>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   04 / IMPACT: Camera pulls back to wide city panorama & reveals metrics
   ========================================================================= */
function Impact() {
  const containerRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smooth = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 26,
  });

  const panoramaScale = useTransform(smooth, [0, 1], [1.14, reduce ? 1 : 1.0]);
  const panoramaY = useTransform(smooth, [0, 1], [-35, reduce ? 0 : 35]);

  const metrics = [
    ["24,821", "Reports received", "+18% this month"],
    ["18,406", "Repairs completed", "Verified in 48h"],
    ["2.4 days", "Avg. response time", "-42% vs baseline"],
    ["14", "Participating cities", "Expanding Q3 2026"],
  ];

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
  );
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
          START WITH <em>US.</em>
        </DottedTitle>
        <p>
          See something that needs attention? One clear report can improve
          thousands of journeys.
        </p>
        <div className="button-row">
          <ButtonLink
            onClick={(e) => {
              e.preventDefault();
              onOpenGlobe();
            }}
          >
            Report a pothole
          </ButtonLink>
          <ButtonLink href="#risk-map" variant="dark">
            Open city map
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
          <span className="gallery-tag">01 · SCAN</span>
        </div>
        <div className="gallery-item">
          <img
            src={repairedRoadImage}
            alt="Smooth resurfaced city road at sunset"
            loading="lazy"
          />
          <span className="gallery-tag">02 · RESTORE</span>
        </div>
        <div className="gallery-item">
          <img
            src={cityPanoramaImage}
            alt="Wide city road network flowing safely"
            loading="lazy"
          />
          <span className="gallery-tag">03 · CONNECT</span>
        </div>
      </div>

      {/* Quick Report Strip with 3D Globe Action */}
      <div id="report" className="report-strip glass">
        <div className="report-icon-wrap">
          <MapPin size={28} />
        </div>
        <div className="report-text">
          <strong>SPOT IT. PIN IT. SEND IT.</strong>
          <small>Photo + location. Less than 60 seconds.</small>
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
  );
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
          <p>Collaborating with local councils, cyclists, and drivers worldwide.</p>
          <button
            onClick={onOpenGlobe}
            className="footer-sub-link"
            style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}
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
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          BACK TO TOP ↑
        </a>
      </div>
    </footer>
  );
}

/* =========================================================================
   APP ROOT: Active section spy, 3D Globe picker & Pothole report modal
   ========================================================================= */
export default function App() {
  const [active, setActive] = useState("home");
  const [isGlobeOpen, setIsGlobeOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

  // Open 3D Globe
  const handleOpenGlobe = () => {
    setIsReportModalOpen(false);
    setIsGlobeOpen(true);
  };

  // Called when user selects & confirms location on 3D globe
  const handleConfirmLocation = (location: SelectedLocation) => {
    setSelectedLocation(location);
    setIsGlobeOpen(false);
    setIsReportModalOpen(true);
  };

  // Inspect existing map issue on globe
  const handleSelectIssueForGlobe = (issue: any) => {
    if (issue.coordinates) {
      setSelectedLocation({
        lat: issue.coordinates.lat,
        lng: issue.coordinates.lng,
        address: `${issue.street}, London`,
      });
    }
    setIsGlobeOpen(true);
  };

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
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        });
      },
      { rootMargin: "-35% 0px -45% 0px" }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="roadguard-app">
      <Header active={active} onOpenGlobe={handleOpenGlobe} />
      <main>
        <Hero onOpenGlobe={handleOpenGlobe} />
        <Detection />
        <RiskMap onSelectIssueForGlobe={handleSelectIssueForGlobe} />
        <RepairJourney />
        <Impact />
        <Community onOpenGlobe={handleOpenGlobe} />
      </main>
      <Footer onOpenGlobe={handleOpenGlobe} />

      {/* Full-Screen Interactive 3D Earth Globe Location Picker */}
      <GlobeLocationPicker
        isOpen={isGlobeOpen}
        onClose={() => setIsGlobeOpen(false)}
        onConfirmLocation={handleConfirmLocation}
        initialLocation={
          selectedLocation
            ? { lat: selectedLocation.lat, lng: selectedLocation.lng }
            : undefined
        }
      />

      {/* Pothole Report Telemetry Modal */}
      <PotholeReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        location={selectedLocation}
        onOpenGlobe={handleOpenGlobe}
      />
    </div>
  );
}
