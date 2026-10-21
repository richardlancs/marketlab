"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { alertEmailSettingsAction, setAlertEmailsAction, type AlertEmailSettings } from "@/lib/email-actions";

/** "Email me when an alert triggers", under the alerts list. Opt-in; signed-in users with a confirmed address only. */
export function AlertEmailsToggle() {
  const [settings, setSettings] = useState<AlertEmailSettings | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    alertEmailSettingsAction().then((s) => !cancelled && setSettings(s), () => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings || settings.status === "off-here") return null;
  if (settings.status === "guest") {
    return (
      <p className="mt-3 text-xs text-muted">
        <Link href="/sign-in" className="text-accent hover:underline">
          Sign in
        </Link>{" "}
        to get an email when an alert triggers.
      </p>
    );
  }
  if (settings.status === "unconfirmed") {
    return <p className="mt-3 text-xs text-muted">Confirm your email address ({settings.email}) to get alerts by email.</p>;
  }
  return (
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={settings.enabled}
        disabled={pending}
        onChange={(e) => {
          const on = e.target.checked;
          start(async () => setSettings(await setAlertEmailsAction(on)));
        }}
        className="mt-1 accent-accent"
      />
      <span>
        Email me when an alert triggers
        <span className="block text-xs text-muted">One email after the close with everything that triggered, to {settings.email}. Unsubscribe from any email.</span>
      </span>
    </label>
  );
}
