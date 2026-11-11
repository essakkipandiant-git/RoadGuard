import React, { useState, useEffect } from "react"
import { Cloud, RefreshCw, CheckCircle2, AlertCircle, X, LogIn } from "lucide-react"
import { MigrationService, LocalPendingReport, SyncResult } from "../services/migrationService"
import { ApiUser } from "../services/apiClient"

interface SyncReportsBannerProps {
  currentUser: ApiUser | null
  onOpenAuth: () => void
  onSyncComplete?: (result: SyncResult) => void
}

export default function SyncReportsBanner({
  currentUser,
  onOpenAuth,
  onSyncComplete,
}: SyncReportsBannerProps) {
  const [pendingReports, setPendingReports] = useState<LocalPendingReport[]>([])
  const [isDismissed, setIsDismissed] = useState<boolean>(false)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle")
  const [statusMessage, setStatusMessage] = useState<string>("")

  // Refresh pending count
  const checkPending = () => {
    const queue = MigrationService.detectAndQueueLegacyUnsynced()
    setPendingReports(queue)
  }

  useEffect(() => {
    setIsDismissed(MigrationService.isBannerDismissed())
    checkPending()

    // Poll periodically for any newly created offline reports
    const interval = setInterval(checkPending, 8000)
    return () => clearInterval(interval)
  }, [])

  // When user signs in or changes, re-check pending
  useEffect(() => {
    checkPending()
  }, [currentUser])

  if (isDismissed || (pendingReports.length === 0 && syncStatus === "idle")) {
    return null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    MigrationService.setBannerDismissed(true)
  }

  const handleKeepLocal = () => {
    MigrationService.markAllAsLocallySaved()
    setSyncStatus("success")
    setStatusMessage("Report successfully saved to this device's persistent memory. Visible on all city maps and dashboards.")
    checkPending()
    setTimeout(() => {
      handleDismiss()
    }, 2200)
  }

  const handleSyncNow = async () => {
    if (!currentUser) {
      onOpenAuth()
      return
    }

    setIsSyncing(true)
    setSyncStatus("idle")
    setStatusMessage("")
    setSyncProgress({ current: 0, total: pendingReports.length })

    try {
      const result = await MigrationService.syncPendingReports({
        forceDuplicate: true,
        onProgress: (synced, total) => {
          setSyncProgress({ current: synced, total })
        },
      })

      if (result.syncedCount > 0) {
        setSyncStatus("success")
        setStatusMessage(
          `Successfully saved ${result.syncedCount} report${result.syncedCount > 1 ? "s" : ""} to the city database!`,
        )
        checkPending()
        if (onSyncComplete) {
          onSyncComplete(result)
        }

        // Auto dismiss after 5 seconds on full success
        if (result.failedCount === 0) {
          setTimeout(() => {
            handleDismiss()
          }, 5000)
        }
      } else if (result.failedCount > 0) {
        const rawErr = result.errors[0] || "Backend synchronization failed."
        const isRateLimit = /rate limit/i.test(rawErr)
        const isMissingPhoto = /photograph.*mandatory|ai verification/i.test(rawErr)
        setSyncStatus("error")
        setStatusMessage(
          isRateLimit
            ? `${rawErr} Your Render API and Postgres database are online — click "✓ Keep in Local DB" to clear this notice or wait a moment before retrying.`
            : isMissingPhoto
              ? `Legacy local draft cannot sync without a verified road photo (${rawErr}). Click "✓ Keep in Local DB" to dismiss it.`
              : `Could not sync reports: ${rawErr}`,
        )
      }
    } catch (err: any) {
      setSyncStatus("error")
      setStatusMessage(err?.message || "An unexpected error occurred during synchronization.")
    } finally {
      setIsSyncing(false)
      setSyncProgress(null)
    }
  }

  return (
    <div
      role="region"
      aria-label="Offline report synchronization status"
      className="fixed bottom-6 right-6 z-50 max-w-md w-[calc(100vw-3rem)] rounded-xl border border-amber-500/30 bg-[#12141a]/95 backdrop-blur-md p-4 shadow-2xl text-slate-200 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            {isSyncing ? (
              <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
            ) : syncStatus === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : syncStatus === "error" ? (
              <AlertCircle className="h-5 w-5 text-rose-400" />
            ) : (
              <Cloud className="h-5 w-5" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-wide text-white">
              {syncStatus === "success"
                ? "Reports Preserved"
                : syncStatus === "error"
                ? "Local Storage Active"
                : `${pendingReports.length} Offline Report${pendingReports.length > 1 ? "s" : ""} on Device`}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {statusMessage ||
                (currentUser
                  ? "Report is saved in browser storage. You can sync with the central server or keep it stored on this device."
                  : "Report is safely stored in local device storage. Visible across all dashboards.")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded-md cursor-pointer"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress display */}
      {syncProgress && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>Uploading defects...</span>
            <span>
              {syncProgress.current} / {syncProgress.total}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{
                width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-3 flex items-center justify-end gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleKeepLocal}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
          title="Keep report preserved locally on this device and dismiss alerts"
        >
          ✓ Keep in Local DB
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors rounded-lg cursor-pointer"
        >
          Later
        </button>

        {currentUser ? (
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing || pendingReports.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Sync to City DB</span>
              </>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm cursor-pointer"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign In to Sync</span>
          </button>
        )}
      </div>
    </div>
  )
}

