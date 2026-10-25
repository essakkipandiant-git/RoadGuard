import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Globe,
  MapPin,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SelectedLocation } from "./GlobeLocationPicker";

type PotholeReportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  location: SelectedLocation | null;
  onOpenGlobe: () => void;
};

const DAMAGE_TYPES = [
  { id: "cavity", label: "Deep Pothole Cavity", icon: AlertTriangle, defaultSeverity: "Critical" },
  { id: "crack", label: "Longitudinal / Web Cracking", icon: ShieldAlert, defaultSeverity: "High" },
  { id: "edge", label: "Asphalt Edge Failure", icon: Compass, defaultSeverity: "Moderate" },
  { id: "depression", label: "Subsurface Settlement", icon: FileText, defaultSeverity: "High" },
];

const SEVERITIES = [
  { id: "critical", label: "Level 1 · Critical", color: "#E65336", desc: "Immediate rim/tire hazard" },
  { id: "high", label: "Level 2 · High", color: "#F16649", desc: "Significant vehicle impact" },
  { id: "moderate", label: "Level 3 · Moderate", color: "#E69D36", desc: "Early structural wear" },
];

export default function PotholeReportModal({
  isOpen,
  onClose,
  location,
  onOpenGlobe,
}: PotholeReportModalProps) {
  const [selectedType, setSelectedType] = useState("cavity");
  const [selectedSeverity, setSelectedSeverity] = useState("critical");
  const [notes, setNotes] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<string>("/images/detection_asphalt.jpg");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      const randomId = "RG-" + Math.floor(10000 + Math.random() * 90000);
      setSubmittedReportId(randomId);
    }, 900);
  };

  const handleReset = () => {
    setSubmittedReportId(null);
    setNotes("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="report-modal-overlay">
      <div className="report-modal-backdrop" onClick={onClose} />

      <motion.div
        className="report-modal-card glass"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      >
        <button onClick={onClose} className="modal-close-btn" aria-label="Close dialog">
          <X size={18} />
        </button>

        {submittedReportId ? (
          /* SUCCESS STATE */
          <div className="report-success-state">
            <div className="success-badge-icon">
              <CheckCircle2 size={48} className="text-emerald-500" />
            </div>
            <span className="eyebrow">
              <span /> DISPATCH NOTIFICATION CREATED
            </span>
            <h2 className="success-title">REPORT LOGGED</h2>
            <div className="tracking-code-pill">
              <span>TRACKING ID:</span>
              <strong>#{submittedReportId}</strong>
            </div>

            <p className="success-copy">
              Thank you for keeping your city streets safe. Your report has been verified by RoadGuard
              AI and scheduled with the district maintenance crew.
            </p>

            <div className="success-details-card glass">
              <div>
                <small>LOCATION</small>
                <strong>{location ? location.address : "Central Arterial Route"}</strong>
              </div>
              <div>
                <small>COORDINATES</small>
                <span>{location ? `${location.lat}° N, ${location.lng}° W` : "51.5082° N, 0.1245° W"}</span>
              </div>
              <div>
                <small>ESTIMATED CREW RESPONSE</small>
                <strong className="text-vermilion">Within 48 Hours</strong>
              </div>
            </div>

            <div className="success-actions">
              <button onClick={handleReset} className="button button--primary">
                Done & Return to Overview
              </button>
            </div>
          </div>
        ) : (
          /* REPORT FORM */
          <form onSubmit={handleSubmit} className="report-form-flow">
            <div className="modal-header">
              <p className="eyebrow">
                <span /> ROAD INCIDENT TELEMETRY
              </p>
              <h2 className="modal-title">REPORT ROAD DAMAGE</h2>
              <p className="modal-subtitle">
                Provide street details so municipal repair teams can prioritize quick resolution.
              </p>
            </div>

            {/* Location Source of Truth Card */}
            <div className="selected-location-box glass">
              <div className="location-box-header">
                <div className="loc-label-group">
                  <MapPin size={16} className="text-vermilion" />
                  <span>SELECTED ROAD COORDINATES</span>
                </div>
                <button
                  type="button"
                  onClick={onOpenGlobe}
                  className="repick-globe-btn"
                  title="Open 3D Globe Location Picker"
                >
                  <Globe size={13} />
                  <span>Adjust on 3D Globe</span>
                </button>
              </div>

              {location ? (
                <div className="location-verified-info">
                  <strong>{location.address}</strong>
                  <div className="coord-chips">
                    <span>LAT: {location.lat}° N</span>
                    <span>LNG: {location.lng}° W</span>
                    <span className="verified-chip">
                      <Check size={11} /> 3D TERRAIN VERIFIED
                    </span>
                  </div>
                </div>
              ) : (
                <div className="no-location-prompt">
                  <p>No location selected yet.</p>
                  <button
                    type="button"
                    onClick={onOpenGlobe}
                    className="button button--primary"
                  >
                    <span>Launch 3D Globe Picker</span>
                    <ArrowDownRight size={15} />
                  </button>
                </div>
              )}
            </div>

            {/* Damage Category */}
            <div className="form-group">
              <label className="field-label">HAZARD CLASSIFICATION</label>
              <div className="damage-type-grid">
                {DAMAGE_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      type="button"
                      key={type.id}
                      className={`damage-type-card ${
                        selectedType === type.id ? "is-selected" : ""
                      }`}
                      onClick={() => setSelectedType(type.id)}
                    >
                      <Icon size={18} className="type-icon" />
                      <span>{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Severity Level */}
            <div className="form-group">
              <label className="field-label">SEVERITY ASSESSMENT</label>
              <div className="severity-row">
                {SEVERITIES.map((sev) => (
                  <button
                    type="button"
                    key={sev.id}
                    className={`severity-pill ${
                      selectedSeverity === sev.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedSeverity(sev.id)}
                  >
                    <span
                      className="sev-indicator"
                      style={{ backgroundColor: sev.color }}
                    />
                    <div>
                      <strong>{sev.label}</strong>
                      <small>{sev.desc}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Attachment */}
            <div className="form-group">
              <label className="field-label">DAMAGE EVIDENCE (PHOTO)</label>
              <div className="photo-preview-row">
                <div
                  className="preview-photo-thumb"
                  style={{ backgroundImage: `url(${selectedPhoto})` }}
                >
                  <span className="photo-badge">EVIDENCE ATTACHED</span>
                </div>
                <div className="photo-actions">
                  <p>Auto-captured or upload road photo for computer vision classification.</p>
                  <div className="photo-btn-group">
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto("/images/detection_asphalt.jpg")}
                      className={`sample-photo-btn ${
                        selectedPhoto === "/images/detection_asphalt.jpg" ? "active" : ""
                      }`}
                    >
                      Cavity Sample
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto("/images/hero_road.jpg")}
                      className={`sample-photo-btn ${
                        selectedPhoto === "/images/hero_road.jpg" ? "active" : ""
                      }`}
                    >
                      Street Sample
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes textarea */}
            <div className="form-group">
              <label className="field-label">OBSERVATIONS & DETAILS (OPTIONAL)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="E.g. Located on lane 2 near bus stop, high water accumulation during rain..."
                className="report-textarea"
                rows={2}
              />
            </div>

            {/* Submit Action */}
            <div className="modal-actions">
              <button
                type="button"
                onClick={onClose}
                className="cancel-btn"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary submit-report-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span>Transmitting Telemetry...</span>
                ) : (
                  <>
                    <span>Submit Verified Report</span>
                    <ArrowDownRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
