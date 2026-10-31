"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/account/avatar";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { AVATAR_SIZE, cleanName, NAME_LENGTH } from "@/lib/profile";
import { changeEmailAction, removeAvatarAction, updateNameAction, uploadAvatarAction, type AccountSettings } from "@/lib/profile-actions";
import { inputClass, labelClass, primaryButton, secondaryButton } from "./styles";
import { signInWithGoogleAgain, useAccountSettings } from "./use-settings";

type UserSettings = Extract<AccountSettings, { kind: "user" }>;
type Status = { tone: "ok" | "error"; text: string } | null;

/** A form's result line. role="status" announces it to screen readers without interrupting. */
function StatusLine({ status }: { status: Status }) {
  return (
    <p role="status" className={`min-h-5 text-sm ${status?.tone === "error" ? "text-loss" : "text-gain"}`}>
      {status?.text}
    </p>
  );
}

/**
 * The account page (app/account): profile picture, name, email address,
 * password and signed-in devices. Signed out, it says what an account is for.
 */
export function ProfileSettings() {
  const { session, settings, refetchSession } = useAccountSettings();

  if (!settings) return <p className="mt-8 text-sm text-muted">Loading your account…</p>;

  if (settings.kind !== "user" || !session) {
    return (
      <Card className="mt-8 max-w-2xl">
        <h2 className="text-lg font-semibold">You&apos;re not signed in</h2>
        <p className="mt-2 text-sm text-muted">
          {settings.kind === "guest"
            ? "You're using MarketLab as a guest: your portfolio is saved for this browser only. Create an account to keep it everywhere and set a name and picture."
            : "Create an account to save your portfolio, watchlist and lessons everywhere, and to set a name and picture."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/sign-up" className={primaryButton}>
            Create an account
          </Link>
          <Link href="/sign-in" className={secondaryButton}>
            Sign in
          </Link>
        </div>
        <p className="mt-4 text-sm">
          <Link href="/account/data" className="tap text-accent hover:underline">
            Download or erase what this browser has saved
          </Link>
        </p>
      </Card>
    );
  }

  const { user } = session;
  return (
    <div className="mt-8 grid max-w-2xl gap-6">
      <Suspense>
        <EmailChangedNotice />
      </Suspense>
      <Card aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-lg font-semibold">
          Profile
        </h2>
        <AvatarEditor name={user.name} image={user.image} onSaved={refetchSession} />
        <NameForm name={user.name} onSaved={refetchSession} />
      </Card>
      <Card aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-lg font-semibold">
          Email address
        </h2>
        <p className="mt-1 text-sm text-muted">
          <span className="font-medium text-foreground">{user.email}</span> {user.emailVerified ? "· confirmed" : "· not confirmed yet"}
        </p>
        {settings.emailChange ? (
          <EmailForm settings={settings} verified={user.emailVerified} />
        ) : (
          <p className="mt-3 text-sm text-muted">Changing your email isn&apos;t available on this site, because it can&apos;t send the confirmation email.</p>
        )}
      </Card>
      <Card aria-labelledby="security-heading">
        <h2 id="security-heading" className="text-lg font-semibold">
          Password and sign-in
        </h2>
        <p className="mt-1 text-sm text-muted">
          You sign in with {[settings.hasPassword && "your email and password", settings.google && "Google"].filter(Boolean).join(" or ")}.
        </p>
        {settings.hasPassword ? (
          <PasswordForm />
        ) : (
          <p className="mt-3 text-sm text-muted">Your account has no password: Google confirms it&apos;s you each time you sign in.</p>
        )}
        <OtherDevices />
      </Card>
      <p className="text-sm text-muted">
        To download everything we keep about you, erase parts of it or delete your account, go to{" "}
        <Link href="/account/data" className="text-accent hover:underline">
          Privacy and your data
        </Link>
        .
      </p>
    </div>
  );
}

/** After the link in the new address's email: Better Auth comes back with ?email=changed. */
function EmailChangedNotice() {
  if (useSearchParams().get("email") !== "changed") return null;
  return (
    <p role="status" className="rounded-xl bg-gain/10 px-3.5 py-2.5 text-sm text-gain">
      Your email address is confirmed and changed.
    </p>
  );
}

/**
 * Crops the picture to a centred square and shrinks it to AVATAR_SIZE in the
 * browser, as WebP (JPEG where the browser can't make WebP). Drawing it
 * afresh also drops everything else the file held, such as where a photo
 * was taken.
 */
async function squareImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context || side === 0) throw new Error("Can't draw the picture.");
  const draw = (background?: string) => {
    context.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  };
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  draw();
  let blob = await encode("image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    draw("#ffffff"); // JPEG has no transparency
    blob = await encode("image/jpeg", 0.88);
  }
  bitmap.close();
  if (!blob) throw new Error("Can't save the picture.");
  return blob;
}

/** The biggest file worth trying to read in the browser; the saved picture is far smaller. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

function AvatarEditor({ name, image, onSaved }: { name: string; image: string | null | undefined; onSaved: () => unknown }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  // The preview's object URL is released when it's replaced or the page goes.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview.url)), [preview]);

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = ""; // choosing the same file again still works
    if (!file) return;
    setStatus(null);
    if (file.size > MAX_SOURCE_BYTES) return setStatus({ tone: "error", text: "That file is too big. Choose a picture under 25 MB." });
    try {
      const blob = await squareImage(file);
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      setStatus({ tone: "error", text: "Couldn't read that picture. Try a JPEG, PNG or WebP." });
    }
  }

  async function run(call: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setBusy(true);
    setStatus(null);
    try {
      const result = await call();
      if (!result.ok) return setStatus({ tone: "error", text: result.message ?? "Something went wrong." });
      setPreview(null);
      await onSaved();
      setStatus({ tone: "ok", text: done });
    } catch {
      setStatus({ tone: "error", text: "Couldn't reach MarketLab. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!preview) return;
    const form = new FormData();
    form.append("avatar", preview.blob, "avatar");
    return run(() => uploadAvatarAction(form), "Picture saved.");
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, which next/image can't optimise or size
          <img src={preview.url} alt="Your new picture" width={80} height={80} className="size-20 rounded-full object-cover" />
        ) : (
          <Avatar name={name} image={image} size={80} />
        )}
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <>
              <button type="button" onClick={save} disabled={busy} className={primaryButton}>
                {busy ? "Saving…" : "Save picture"}
              </button>
              <button type="button" onClick={() => setPreview(null)} disabled={busy} className={secondaryButton}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <label htmlFor={inputId} className={`${secondaryButton} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent`}>
                {image ? "Change picture" : "Add a picture"}
                <input
                  ref={input}
                  id={inputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              </label>
              {image && (
                <button type="button" onClick={() => run(removeAvatarAction, "Picture removed.")} disabled={busy} className={secondaryButton}>
                  Remove
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        Cropped to a square in your browser. Only you see it: it isn&apos;t shown on the leaderboard. Location and camera details in photos are removed.
      </p>
      <StatusLine status={status} />
    </div>
  );
}

function NameForm({ name, onSaved }: { name: string; onSaved: () => unknown }) {
  const [value, setValue] = useState(name);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const cleaned = cleanName(value);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!cleaned) return setStatus({ tone: "error", text: `Enter a name of up to ${NAME_LENGTH} characters.` });
    setBusy(true);
    setStatus(null);
    try {
      const result = await updateNameAction(cleaned);
      if (!result.ok) return setStatus({ tone: "error", text: result.message });
      await onSaved();
      setValue(cleaned);
      setStatus({ tone: "ok", text: "Name saved." });
    } catch {
      setStatus({ tone: "error", text: "Couldn't reach MarketLab. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4">
      <label htmlFor="profile-name" className={labelClass}>
        Name
      </label>
      <div className="flex gap-2">
        <input
          id="profile-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          maxLength={NAME_LENGTH}
          autoComplete="name"
          aria-describedby="profile-name-hint"
          className={inputClass}
        />
        <button type="submit" disabled={busy || cleaned === name} className={`${primaryButton} mt-1 h-11 shrink-0`}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p id="profile-name-hint" className="mt-1 text-xs text-muted">
        Used in emails we send you. Your leaderboard name is separate.
      </p>
      <StatusLine status={status} />
    </form>
  );
}

function EmailForm({ settings, verified }: { settings: UserSettings; verified: boolean }) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const needsSignIn = !settings.hasPassword;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const email = String(form.get("new-email") ?? "");
    setBusy(true);
    setStatus(null);
    try {
      const result = await changeEmailAction(email, form.get("email-password"));
      if (!result.ok) return setStatus({ tone: "error", text: result.message });
      setStatus({
        tone: "ok",
        text:
          result.sentTo === "old"
            ? "Check your current inbox: open the link we sent to confirm the change. Then we'll send one to the new address."
            : `Done. Open the link we sent to ${email.trim().toLowerCase()} to confirm it.`,
      });
      target.reset();
    } catch {
      setStatus({ tone: "error", text: "Couldn't reach MarketLab. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div>
        <label htmlFor="new-email" className={labelClass}>
          New email address
        </label>
        <input id="new-email" name="new-email" type="email" required maxLength={254} autoComplete="email" className={inputClass} />
      </div>
      {settings.hasPassword && (
        <div>
          <label htmlFor="email-password" className={labelClass}>
            Your password
          </label>
          <input id="email-password" name="email-password" type="password" required autoComplete="current-password" className={inputClass} />
        </div>
      )}
      <p className="text-xs text-muted">
        {verified
          ? "Nothing changes until you open a link we send to your current address, and then one sent to the new one."
          : "Your current address isn't confirmed, so it changes straight away; then confirm the new one from its inbox."}
        {needsSignIn && " Without a password, you need to have signed in with Google in the last 10 minutes."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Sending…" : "Change email"}
        </button>
        {needsSignIn && <GoogleAgain path="/account" />}
      </div>
      <StatusLine status={status} />
    </form>
  );
}

/** Signs in with Google again, for a change that needs a recent sign-in. */
export function GoogleAgain({ path }: { path: string }) {
  return (
    <button type="button" onClick={() => void signInWithGoogleAgain(path)} className={secondaryButton}>
      Sign in with Google again
    </button>
  );
}

function PasswordForm() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const newPassword = String(form.get("new-password") ?? "");
    if (newPassword !== String(form.get("repeat-password") ?? "")) return setStatus({ tone: "error", text: "The two new passwords don't match." });
    setBusy(true);
    setStatus(null);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("current-password") ?? ""),
      newPassword,
      revokeOtherSessions: form.get("sign-out-others") === "on",
    });
    setBusy(false);
    if (error) {
      const text =
        error.status === 429
          ? "Too many attempts. Wait a minute, then try again."
          : error.code === "INVALID_PASSWORD"
            ? "Your current password isn't right."
            : (error.message ?? "Couldn't change your password. Try again.");
      return setStatus({ tone: "error", text });
    }
    target.reset();
    setStatus({ tone: "ok", text: "Password changed." });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div>
        <label htmlFor="current-password" className={labelClass}>
          Current password
        </label>
        <input id="current-password" name="current-password" type="password" required autoComplete="current-password" className={inputClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-password" className={labelClass}>
            New password
          </label>
          <input id="new-password" name="new-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={inputClass} />
        </div>
        <div>
          <label htmlFor="repeat-password" className={labelClass}>
            New password again
          </label>
          <input id="repeat-password" name="repeat-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={inputClass} />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="sign-out-others" defaultChecked />
        Sign out everywhere else
      </label>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Changing…" : "Change password"}
      </button>
      <StatusLine status={status} />
    </form>
  );
}

function OtherDevices() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function signOutOthers() {
    setBusy(true);
    setStatus(null);
    const { error } = await authClient.revokeOtherSessions();
    setBusy(false);
    setStatus(error ? { tone: "error", text: "Couldn't sign out your other devices. Try again." } : { tone: "ok", text: "Signed out on every other device and browser." });
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Other devices</h3>
      <p className="mt-1 text-sm text-muted">Signed in on a computer you no longer use? Sign out there from here. This device stays signed in.</p>
      <button type="button" onClick={signOutOthers} disabled={busy} className={`${secondaryButton} mt-3`}>
        {busy ? "Signing out…" : "Sign out everywhere else"}
      </button>
      <StatusLine status={status} />
    </div>
  );
}
