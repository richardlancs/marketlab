"use server";

/**
 * Server Actions for alert emails (lib/alert-emails.ts): whether this visitor
 * can get them and has them on, and turning them on or off. Only signed-in
 * users with a confirmed address can: guests have no address, and an
 * unconfirmed one might not be theirs.
 */
import { eq } from "drizzle-orm";
import { alertEmails, db } from "./db";
import { user } from "./db/schema";
import { emailEnabled } from "./email";
import { currentOwner } from "./owner";

export type AlertEmailSettings =
  | { status: "off-here" }
  | { status: "guest" }
  | { status: "unconfirmed"; email: string }
  | { status: "ready"; email: string; enabled: boolean };

async function signedInUser() {
  const owner = await currentOwner({ create: false });
  if (owner?.kind !== "user") return null;
  const [row] = await db.select({ id: user.id, email: user.email, verified: user.emailVerified }).from(user).where(eq(user.id, owner.id));
  return row ?? null;
}

export async function alertEmailSettingsAction(): Promise<AlertEmailSettings> {
  if (!emailEnabled()) return { status: "off-here" };
  const me = await signedInUser();
  if (!me) return { status: "guest" };
  if (!me.verified) return { status: "unconfirmed", email: me.email };
  return { status: "ready", email: me.email, enabled: await alertEmails.enabled(me.id) };
}

export async function setAlertEmailsAction(on: unknown): Promise<AlertEmailSettings> {
  if (typeof on !== "boolean" || !emailEnabled()) return alertEmailSettingsAction();
  const me = await signedInUser();
  if (me?.verified) await alertEmails.setEnabled(me.id, on);
  return alertEmailSettingsAction();
}
