"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { forgetDevice } from "@/components/alerts/push-device";
import { Card } from "@/components/ui/card";
import { PREFERENCE_KEYS } from "@/lib/consent";
import { DATA_KIND_INFO, DATA_KINDS, DELETE_PHRASE, GUEST_DATA_KINDS, RECENT_SIGN_IN, type DataKind } from "@/lib/profile";
import { deleteAccountAction, deleteGuestAction, eraseDataAction, type AccountSettings } from "@/lib/profile-actions";
import { GoogleAgain } from "./profile-settings";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "./styles";
import { useAccountSettings } from "./use-settings";

type Status = { tone: "ok" | "error"; text: string } | null;
const OFFLINE = "Couldn't reach MarketLab. Check your connection and try again.";

/**
 * After a change that resets what the page shows, it reloads with ?done=…,
 * so every part of the app (the portfolio, lessons, saved runs) starts from
 * what the server now has, not what it had in memory.
 */
const DONE: Record<string, string> = {
  erased: "Done: what you chose has been erased.",
  "guest-deleted": "Done: everything this browser saved has been deleted.",
  deleted: "Your account and everything in it have been deleted. Thanks for trying MarketLab.",
  cleared: "Done: this browser's saved preferences have been cleared.",
};

function DoneNotice() {
  const text = DONE[useSearchParams().get("done") ?? ""];
  if (!text) return null;
  return (
    <p role="status" className="rounded-xl bg-gain/10 px-3.5 py-2.5 text-sm text-gain">
      {text}
    </p>
  );
}

// A full page load on purpose (not router.push): every provider in the layout must start over from the server.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
const reloadWith = (done: keyof typeof DONE) => location.assign(`/account/data?done=${done}`);

/** The "Privacy and your data" page (app/account/data), for signed-in users and guests alike. */
export function DataSettings() {
  const { session, settings } = useAccountSettings();

  return (
    <div className="mt-8 grid max-w-2xl gap-6">
      <Suspense>
        <DoneNotice />
      </Suspense>
      {!settings ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <DownloadCard settings={settings} />
          {settings.kind !== "none" && <EraseCard kinds={settings.kind === "user" ? DATA_KINDS : GUEST_DATA_KINDS} />}
          {settings.kind === "guest" && <DeleteGuestCard />}
          {settings.kind === "user" && session && <DeleteAccountCard settings={settings} />}
        </>
      )}
      <BrowserCard />
    </div>
  );
}

function DownloadCard({ settings }: { settings: AccountSettings }) {
  return (
    <Card aria-labelledby="download-heading">
      <h2 id="download-heading" className="text-lg font-semibold">
        Download your data
      </h2>
      {settings.kind === "none" ? (
        <p className="mt-2 text-sm text-muted">Nothing is saved for this browser yet: MarketLab saves a guest portfolio only once you change something.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            One file (JSON) with everything MarketLab keeps about {settings.kind === "user" ? "your account" : "this browser's guest"}: profile, sign-ins, portfolio and trades with your notes, watchlist,
            alerts, saved backtests, lesson progress, leaderboard and competition entries, badges and notification settings. Never your password or sign-in tokens.
          </p>
          <a href="/api/account/export" download className={`${primaryButton} mt-4`}>
            Download my data
          </a>
        </>
      )}
    </Card>
  );
}

function EraseCard({ kinds }: { kinds: readonly DataKind[] }) {
  const [chosen, setChosen] = useState<DataKind[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (kind: DataKind, on: boolean) => {
    setConfirming(false);
    setChosen((c) => (on ? [...c, kind] : c.filter((k) => k !== kind)));
  };

  async function erase() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await eraseDataAction(chosen);
      if (!result.ok) {
        setStatus({ tone: "error", text: result.message });
        setBusy(false);
        return;
      }
      reloadWith("erased");
    } catch {
      setStatus({ tone: "error", text: OFFLINE });
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="erase-heading">
      <h2 id="erase-heading" className="text-lg font-semibold">
        Erase some of your data
      </h2>
      <p className="mt-2 text-sm text-muted">Choose what to erase. The rest, and your account, stay. This can&apos;t be undone, so download a copy first if you might want it.</p>
      <fieldset className="mt-4 space-y-3">
        <legend className="sr-only">What to erase</legend>
        {kinds.map((kind) => (
          <label key={kind} className="flex gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 shrink-0" checked={chosen.includes(kind)} onChange={(e) => toggle(kind, e.target.checked)} disabled={busy} />
            <span>
              <span className="font-medium">{DATA_KIND_INFO[kind].label}</span>
              <span className="block text-muted">{DATA_KIND_INFO[kind].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <button type="button" onClick={erase} disabled={busy} className={dangerButton}>
              {busy ? "Erasing…" : `Yes, erase ${chosen.length === 1 ? "it" : `these ${chosen.length}`}`}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={secondaryButton}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} disabled={chosen.length === 0} className={secondaryButton}>
            Erase selected
          </button>
        )}
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-loss">
        {status?.text}
      </p>
    </Card>
  );
}

function DeleteGuestCard() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await deleteGuestAction();
      if (!result.ok) {
        setStatus({ tone: "error", text: result.message });
        setBusy(false);
        return;
      }
      await forgetDevice(); // stops this browser's push subscription too
      reloadWith("guest-deleted");
    } catch {
      setStatus({ tone: "error", text: OFFLINE });
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="guest-heading">
      <h2 id="guest-heading" className="text-lg font-semibold">
        Delete everything this browser saved
      </h2>
      <p className="mt-2 text-sm text-muted">
        You&apos;re using MarketLab as a guest. This deletes the guest and all it saved, and forgets the cookie that links this browser to it. Unused guests are deleted
        automatically after 180 days anyway.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <button type="button" onClick={remove} disabled={busy} className={dangerButton}>
              {busy ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={secondaryButton}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={secondaryButton}>
            Delete guest data
          </button>
        )}
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-loss">
        {status?.text}
      </p>
    </Card>
  );
}

function DeleteAccountCard({ settings }: { settings: Extract<AccountSettings, { kind: "user" }> }) {
  const [status, setStatus] = useState<{ tone: "error"; text: string; signInAgain?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState("");
  // Without a password, deleting needs a Google sign-in from the last few minutes.
  const [recent] = useState(() => Date.now() - settings.signedInAt < RECENT_SIGN_IN);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setStatus(null);
    try {
      const result = await deleteAccountAction(phrase, form.get("delete-password"));
      if (!result.ok) {
        setStatus({ tone: "error", text: result.message, signInAgain: result.signInAgain });
        setBusy(false);
        return;
      }
      await forgetDevice(); // the server forgot this device with the account; this stops the browser's subscription
      reloadWith("deleted");
    } catch {
      setStatus({ tone: "error", text: OFFLINE });
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="delete-heading" className="border-loss/40">
      <h2 id="delete-heading" className="text-lg font-semibold">
        Delete your account
      </h2>
      <p className="mt-2 text-sm text-muted">
        Deletes your account and everything in it, straight away and for good: your profile and picture, practice portfolio and trades, watchlist and alerts, saved
        backtests, lesson progress, leaderboard and competition entries, badges, and notification settings. You&apos;ll be signed out everywhere.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        {settings.hasPassword ? (
          <div>
            <label htmlFor="delete-password" className={labelClass}>
              Your password
            </label>
            <input id="delete-password" name="delete-password" type="password" required autoComplete="current-password" className={inputClass} />
          </div>
        ) : (
          !recent && (
            <div className="rounded-xl bg-foreground/[0.04] p-3 text-sm">
              <p>To make sure it&apos;s you, sign in with Google again, then delete within 10 minutes.</p>
              <div className="mt-3">
                <GoogleAgain path="/account/data#delete-heading" />
              </div>
            </div>
          )
        )}
        <div>
          <label htmlFor="delete-phrase" className={labelClass}>
            Type <span className="font-mono">{DELETE_PHRASE}</span> to confirm
          </label>
          <input
            id="delete-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={busy || phrase.trim().toLowerCase() !== DELETE_PHRASE} className={dangerButton}>
          {busy ? "Deleting…" : "Delete my account"}
        </button>
        <p role="status" className="min-h-5 text-sm text-loss">
          {status?.text}
        </p>
        {status?.signInAgain && settings.google && <GoogleAgain path="/account/data#delete-heading" />}
      </form>
    </Card>
  );
}

function BrowserCard() {
  function clearPreferences() {
    try {
      for (const key of PREFERENCE_KEYS) localStorage.removeItem(key);
    } catch {
      // storage blocked: nothing saved there
    }
    reloadWith("cleared");
  }

  return (
    <Card aria-labelledby="browser-heading">
      <h2 id="browser-heading" className="text-lg font-semibold">
        Cookies and this browser
      </h2>
      <p className="mt-2 text-sm text-muted">
        See every cookie MarketLab uses, and choose whether to allow analytics, in{" "}
        <Link href="/privacy/cookies" className="text-accent hover:underline">
          cookie settings
        </Link>
        . Read what we keep and why in the{" "}
        <Link href="/privacy" className="text-accent hover:underline">
          privacy policy
        </Link>
        .
      </p>
      <button type="button" onClick={clearPreferences} className={`${secondaryButton} mt-4`}>
        Clear preferences saved in this browser
      </button>
      <p className="mt-2 text-xs text-muted">Your theme and chart period go back to the defaults. Your account and portfolio aren&apos;t affected.</p>
    </Card>
  );
}
