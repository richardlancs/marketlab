"use client";

import { useEffect } from "react";
import { useAccount } from "@/components/account/account-provider";
import { Card } from "@/components/ui/card";
import { unseenAlerts } from "@/lib/alerts";
import { AlertList } from "./alert-card";
import { AlertEmailsToggle } from "./alert-emails-toggle";
import { PushToggle } from "./push-toggle";

/**
 * Every alert, on the watchlist page (#alerts). Opening it marks triggered
 * alerts as seen, which clears the header badge. Notifications (PushToggle)
 * and emails are offered under the list.
 */
export function AlertsPanel() {
  const { account, removeAlert, markAlertsSeen } = useAccount();
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
      <h2 id="alerts" className="text-lg font-semibold tracking-tight">
        Price alerts
      </h2>
      <p className="mt-1 text-xs text-muted">Checked at each day&apos;s close.</p>
      {alerts.length ? (
        <AlertList alerts={alerts} onRemove={removeAlert} />
      ) : (
        <p className="mt-3 text-sm text-muted">No alerts yet. Set one on any stock&apos;s page.</p>
      )}
      <PushToggle />
      <AlertEmailsToggle />
    </Card>
  );
}
