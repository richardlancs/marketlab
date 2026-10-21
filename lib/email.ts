/**
 * Sending email: verifying addresses (lib/auth.ts) and alert digests
 * (lib/alert-emails.ts). Two ways to send, the first one set up wins:
 *
 * - SMTP, e.g. Gmail: SMTP_USER (the address) and SMTP_PASS (a Google "app
 *   password", not the account password). SMTP_HOST and SMTP_PORT default to
 *   Gmail's (smtp.gmail.com, 465). Mail comes from EMAIL_FROM, or SMTP_USER.
 * - Resend's HTTP API: RESEND_API_KEY and EMAIL_FROM (an address on a domain
 *   verified with Resend).
 *
 * Without either, email is off: in production nothing is offered that would
 * need it (lib/auth.ts only turns verification on when `emailEnabled()`),
 * and in development the message is printed to the server console instead,
 * so the whole flow can be tried locally.
 */
import "server-only";
import nodemailer from "nodemailer";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe on digests. */
  headers?: Record<string, string>;
}

const smtpConfigured = () => !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
const resendConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
const configured = () => smtpConfigured() || resendConfigured();

/** One SMTP connection pool per server instance. */
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465, // 465 is TLS from the start; 587 upgrades with STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

/** Whether this deployment can send email: a provider is set up, or it's development (printed to the console). */
export const emailEnabled = () => configured() || process.env.NODE_ENV !== "production";

/** Guests have placeholder addresses (lib/db/guests.ts) that must never be mailed. */
const isPlaceholder = (address: string) => address.toLowerCase().endsWith("@guest.invalid");

export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (isPlaceholder(email.to)) throw new Error("Guests have no email address.");
  if (!configured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Email isn't set up on this deployment (SMTP_USER and SMTP_PASS, or RESEND_API_KEY and EMAIL_FROM).");
    console.log(`\n[email] To: ${email.to}\n[email] Subject: ${email.subject}\n${email.text}\n`);
    return;
  }
  if (smtpConfigured()) {
    const from = process.env.EMAIL_FROM || `MarketLab <${process.env.SMTP_USER}>`;
    await smtp().sendMail({ from, to: email.to, subject: email.subject, text: email.text, html: email.html, headers: email.headers });
    return;
  }
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html, ...(email.headers && { headers: email.headers }) }),
  });
  if (!response.ok) {
    // The provider's message helps in the server log; it's never shown to users.
    throw new Error(`Email provider refused the message (${response.status}): ${(await response.text()).slice(0, 200)}`);
  }
}

export const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The message that asks someone to confirm their address: one link, valid for a day. */
export function verificationEmail(to: string, name: string, url: string): Email {
  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";
  return {
    to,
    subject: "Confirm your email for MarketLab",
    text: `${greeting}\n\nConfirm that this is your email address for MarketLab by opening this link:\n\n${url}\n\nThe link works for 24 hours. If you didn't sign up for MarketLab, you can ignore this email.`,
    html: `<p>${escape(greeting)}</p><p>Confirm that this is your email address for MarketLab:</p><p><a href="${escape(url)}">Confirm my email</a></p><p style="color:#666">The link works for 24 hours. If you didn't sign up for MarketLab, you can ignore this email.</p>`,
  };
}
