import { describe, expect, it } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import AuthModal from "../components/AuthModal"
import CityTriageDashboard from "../components/CityTriageDashboard"
import IssueDetailDrawer from "../components/IssueDetailDrawer"
import { RoadIssue } from "../types/roadguard"

const mockIssue: RoadIssue = {
  id: "test-issue-1",
  trackingCode: "RG-10001",
  title: "Main Street Pothole",
  category: "cavity",
  severity: "critical",
  status: "reported",
  coordinates: { lat: 51.505, lng: -0.09 },
  address: "100 Main Street",
  city: "Metro City",
  originalPhotoUrl: "/test.jpg",
  detection: {
    engine: "edge_cv",
    category: "cavity",
    confidence: 0.95,
    boxes: [],
    surfaceLossRatio: 0.2,
    depthEstimateMm: 50,
    severity: "critical",
    originalImageUrl: "/test.jpg",
    annotatedImageUrl: "/test.jpg",
    rawInferenceTimeMs: 12,
  },
  risk: {
    score: 85,
    level: "critical",
    factors: {
      damageSeverity: 80,
      roadUsage: 90,
      sensitiveProximity: 80,
      supportingReports: 60,
      unresolvedDuration: 50,
    },
    weights: {
      damageSeverity: 0.35,
      roadUsage: 0.25,
      sensitiveProximity: 0.15,
      supportingReports: 0.15,
      unresolvedDuration: 0.1,
    },
    weightedContributions: {
      damageSeverity: 28,
      roadUsage: 22.5,
      sensitiveProximity: 12,
      supportingReports: 9,
      unresolvedDuration: 5,
    },
    rationale: "High risk test",
  },
  reportedAt: new Date().toISOString(),
  history: [],
} as any

describe("Modal Components Hook Safety Tests", () => {
  describe("AuthModal", () => {
    it("renders cleanly when isOpen is false without throwing", () => {
      const html = renderToString(
        <AuthModal
          isOpen={false}
          onClose={() => {}}
          currentUser={null}
          onUserChange={() => {}}
        />,
      )
      expect(html).toBe("")
    })

    it("renders cleanly when isOpen is true with pilot personas", () => {
      const html = renderToString(
        <AuthModal
          isOpen={true}
          onClose={() => {}}
          currentUser={null}
          onUserChange={() => {}}
        />,
      )
      expect(html).toContain("PILOT AUTHENTICATION")
      expect(html).toContain("Quick Pilot Switcher")
      expect(html).toContain("admin@roadguard.local")
      expect(html).toContain("citizen.test@roadguard.local")
    })

    it("renders cleanly when an authenticated user is provided", () => {
      const html = renderToString(
        <AuthModal
          isOpen={true}
          onClose={() => {}}
          currentUser={{
            id: "usr-1234567890123",
            email: "admin@roadguard.local",
            fullName: "System Administrator",
            role: "SUPER_ADMIN",
          }}
          onUserChange={() => {}}
        />,
      )
      expect(html).toContain("ACTIVE SESSION PROFILE")
      expect(html).toContain("System Administrator")
      expect(html).toContain("Tier 4 (Full Admin)")
    })
  })

  describe("CityTriageDashboard", () => {
    it("renders cleanly when isOpen is false without throwing", () => {
      const html = renderToString(
        <CityTriageDashboard
          isOpen={false}
          onClose={() => {}}
          issues={[mockIssue]}
          currentUserRole="authority"
          onRoleChange={() => {}}
          onSelectIssue={() => {}}
          onOpenGlobeForIssue={() => {}}
          onOpenReportModal={() => {}}
          onRefreshData={async () => {}}
        />,
      )
      expect(html).toBe("")
    })

    it("renders cleanly when isOpen is true with triage controls", () => {
      const html = renderToString(
        <CityTriageDashboard
          isOpen={true}
          onClose={() => {}}
          issues={[mockIssue]}
          currentUserRole="authority"
          onRoleChange={() => {}}
          onSelectIssue={() => {}}
          onOpenGlobeForIssue={() => {}}
          onOpenReportModal={() => {}}
          onRefreshData={async () => {}}
        />,
      )
      expect(html).toContain("CITY ROAD RISK &amp; TRIAGE OPERATIONS")
      expect(html).toContain("Critical Emergencies")
    })
  })

  describe("IssueDetailDrawer", () => {
    it("renders cleanly when isOpen is false without throwing", () => {
      const html = renderToString(
        <IssueDetailDrawer
          isOpen={false}
          onClose={() => {}}
          issue={null}
          currentUserRole="authority"
          onRoleChange={() => {}}
          onIssueUpdated={() => {}}
          onFlyToGlobe={() => {}}
        />,
      )
      expect(html).toBe("")
    })

    it("renders cleanly when isOpen is true and issue is provided", () => {
      const html = renderToString(
        <IssueDetailDrawer
          isOpen={true}
          onClose={() => {}}
          issue={mockIssue}
          currentUserRole="authority"
          onRoleChange={() => {}}
          onIssueUpdated={() => {}}
          onFlyToGlobe={() => {}}
        />,
      )
      expect(html).toContain("Main Street Pothole")
      expect(html).toContain("RG-10001")
    })
  })
})
