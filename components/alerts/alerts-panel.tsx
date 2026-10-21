"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { unseenAlerts } from "@/lib/alerts";
import { AlertList } from "./alert-card";
import { AlertEmailsToggle } from "./alert-emails-toggle";

const noSubscribe = () => () => {};
/** The browser's notification permission, or null where notifications aren't supported (and on the server). */
function usePermission(): NotificationPermission | null {
  return useSyncExternalStore(
    noSubscribe,
    () => ("Notification" in window ? Notification.permission : null),
    () => null,
  );
}

/**
 * Every alert, on the watchlist page (#alerts). Opening it marks triggered
 * alerts as seen, which clears the header badge. Browser notifications are
 * offered here, on a click, never asked for unprompted.
 */
export function AlertsPanel() {
  const { account, removeAlert, markAlertsSeen } = useAccount();
  const permission = usePermission();
  const [, rerender] = useState(0);
  const unseen = account ? unseenAlerts(account).length : 0;

  useEffect(() => {
    if (unseen > 0) void markAlertsSeen();
    // Marks them once they've been shown; markAlertsSeen is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen]);

  if (!account) return null;
  const alerts = account.alerts ?? [];

  return (
    <Card aria-labelledby="alerts" id="alerts">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts" className="text-lg font-semibold tracking-tight">
          Price alerts
        </h2>
        {permission === "default" && (
          <button
            type="button"
            onClick={async () => {
              await Notification.requestPermission();
              rerender((n) => n + 1);
            }}
            className="text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Turn on notifications
          </button>
        )}
        {permission === "denied" && <span className="text-xs text-muted">Notifications are blocked in your browser settings.</span>}
      </div>
      <p className="mt-1 text-xs text-muted">
        Checked at each day&apos;s close. {permission === "granted" ? "You'll get a notification when one triggers while MarketLab is open." : ""}
      </p>
      {alerts.length ? (
        <AlertList alerts={alerts} onRemove={removeAlert} />
      ) : (
        <p className="mt-3 text-sm text-muted">No alerts yet. Set one on any stock&apos;s page.</p>
      )}
      <AlertEmailsToggle />
    </Card>
  );
}
