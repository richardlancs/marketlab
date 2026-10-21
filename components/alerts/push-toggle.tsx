"use client";

import { useEffect, useState, useTransition } from "react";
import { pushSettingsAction, sendTestPushAction, subscribePushAction, type PushSettings } from "@/lib/push-actions";
import { currentSubscription, forgetDevice, needsHomeScreen, pushSupported, subscribeDevice } from "./push-device";

type State =
  | { kind: "loading" }
  /** No push here (not set up on this deployment, or an old browser): notifications only while MarketLab is open. */
  | { kind: "in-tab"; permission: NotificationPermission | null }
  | { kind: "home-screen" }
  | { kind: "push"; settings: Extract<PushSettings, { status: "ready" }>; endpoint: string | null; permission: NotificationPermission };

async function load(): Promise<State> {
  const permission = "Notification" in window ? Notification.permission : null;
  if (!pushSupported()) return needsHomeScreen() ? { kind: "home-screen" } : { kind: "in-tab", permission };
  const subscription = await currentSubscription();
  const settings = await pushSettingsAction(subscription?.endpoint ?? null);
  if (settings.status !== "ready") return { kind: "in-tab", permission };
  return { kind: "push", settings, endpoint: subscription?.endpoint ?? null, permission: Notification.permission };
}

const button = "text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50";

/**
 * "Get alerts on this device", under the alerts list: push notifications
 * that arrive even when MarketLab is closed (lib/alert-pushes.ts). Asked for
 * on a click, never unprompted. Where push isn't available, it offers
 * notifications while MarketLab is open instead (components/alerts/alerts-badge.tsx).
 */
export function PushToggle() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    load().then((s) => !cancelled && setState(s), () => !cancelled && setState({ kind: "in-tab", permission: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") return null;

  if (state.kind === "home-screen") {
    return <p className="mt-3 text-xs text-muted">To get alerts on this iPhone or iPad, add MarketLab to your Home Screen (Share, then Add to Home Screen) and open it from there.</p>;
  }

  if (state.kind === "in-tab") {
    if (state.permission === "denied") return <p className="mt-3 text-xs text-muted">Notifications are blocked in your browser settings.</p>;
    if (state.permission === "granted") return <p className="mt-3 text-xs text-muted">You&apos;ll get a notification when an alert triggers while MarketLab is open.</p>;
    if (state.permission === null) return null;
    return (
      <p className="mt-3 text-sm">
        <button type="button" className={button} onClick={async () => setState({ kind: "in-tab", permission: await Notification.requestPermission() })}>
          Turn on notifications
        </button>
        <span className="block text-xs text-muted">While MarketLab is open.</span>
      </p>
    );
  }

  const on = state.settings.on;
  const blocked = state.permission === "denied";
  return (
    <div className="mt-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={pending || (blocked && !on)}
          onChange={(e) => {
            const want = e.target.checked;
            setNote(null);
            start(async () => {
              try {
                if (want) {
                  const subscription = await subscribeDevice(state.settings.publicKey);
                  if (!subscription) {
                    setState({ ...state, permission: Notification.permission });
                    return;
                  }
                  const settings = await subscribePushAction(subscription.toJSON());
                  if (settings.status === "ready" && !settings.on) setNote("Couldn't turn them on. Try again in a minute.");
                  setState(settings.status === "ready" ? { kind: "push", settings, endpoint: subscription.endpoint, permission: "granted" } : { kind: "in-tab", permission: "granted" });
                } else {
                  await forgetDevice();
                  setState({ ...state, settings: { ...state.settings, on: false }, endpoint: null });
                }
              } catch {
                setNote("This browser couldn't set up notifications.");
              }
            });
          }}
          className="mt-1 accent-accent"
        />
        <span>
          Get alerts on this device
          <span className="block text-xs text-muted">
            {blocked && !on ? "Notifications are blocked in your browser settings." : "A notification after the close when an alert triggers, even when MarketLab isn't open."}
          </span>
        </span>
      </label>
      {on && state.endpoint && (
        <button
          type="button"
          disabled={pending}
          className={`${button} mt-1 ml-6`}
          onClick={() => {
            setNote(null);
            start(async () => {
              const result = await sendTestPushAction(state.endpoint);
              setNote(result.ok ? "Sent. It should appear in a few seconds." : result.message);
            });
          }}
        >
          Send a test
        </button>
      )}
      {note && (
        <p role="status" className="mt-1 ml-6 text-xs text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
