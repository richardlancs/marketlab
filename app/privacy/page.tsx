import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { GUEST_LIFETIME } from "@/lib/maintenance";

export const metadata: Metadata = { title: "Privacy policy — MarketLab", description: "What MarketLab keeps about you, why, for how long, and how to download or delete it." };

/** When this policy last changed. Update it with every change to what's below. */
const UPDATED = "November 1, 2026";

/**
 * Who to write to about privacy (set PRIVACY_CONTACT_EMAIL, see
 * docs/deploying.md). Without it, the account pages are the way to act on
 * every right below.
 */
const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim() || null;

/** The full policy's sections, in order, for the contents list. */
const CONTENTS = [
  ["what", "What we keep"],
  ["public", "What other people can see"],
  ["why", "Why we use it"],
  ["who", "Who else handles it"],
  ["how-long", "How long we keep it"],
  ["rights", "Your choices and rights"],
  ["security", "Keeping it safe"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10 scroll-mt-24">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </section>
  );
}

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="text-accent underline-offset-2 hover:underline">
    {children}
  </Link>
);

/**
 * The privacy policy. Everything here must stay true of the code: what's
 * stored (lib/db/schema.ts), for how long (lib/maintenance.ts), what's in
 * the browser (lib/consent.ts), and who else handles it. Change it, and the
 * date above, whenever any of those changes.
 */
export default function PrivacyPage() {
  const guestDays = Math.round(GUEST_LIFETIME / 86_400_000);
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated {UPDATED}</p>
        <p className="mt-6 text-[0.95rem] leading-relaxed">
          MarketLab is a place to learn about investing with simulated money. No real money, bank details or real trades are ever involved. This page explains, in
          plain words, what we keep about you, why, who else handles it, how long we keep it, and how to see, change or delete it.
        </p>
      </div>

      <section aria-labelledby="glance" className="mt-8 rounded-2xl border border-border bg-linear-to-b from-surface-raised to-surface p-5">
        <h2 id="glance" className="text-xl font-semibold tracking-tight">
          The short version
        </h2>
        <ul className="mt-3 space-y-2 text-[0.95rem] leading-relaxed">
          {[
            ["We keep only what runs your account:", "your name, email, sign-ins, and what you do in MarketLab (simulated portfolio, lessons, competitions)."],
            ["We never sell your data,", "show you ads, or share it with anyone except the services MarketLab runs on."],
            ["Nobody else sees your account.", "Only if you join the leaderboard or a competition do others see the display name you pick and your simulated results."],
            ["Analytics are off unless you say yes,", "and they set no cookies. Our only cookies keep you signed in and remember your portfolio."],
            ["You're in control:", "download everything, correct it, erase parts of it, or delete your account at any time, yourself, with no need to ask."],
          ].map(([lead, rest]) => (
            <li key={lead} className="flex gap-2.5">
              <span aria-hidden className="mt-0.5 text-gain">
                ✓
              </span>
              <span>
                <strong>{lead}</strong> {rest}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/account/data" className="inline-flex h-10 items-center rounded-full bg-accent-fill px-4 font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Download or delete your data
          </Link>
          <Link href="/privacy/cookies" className="inline-flex h-10 items-center rounded-full border border-border bg-surface-raised px-4 font-medium hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Cookie settings
          </Link>
        </div>
      </section>

      <section aria-labelledby="table" className="mt-10">
        <h2 id="table" className="text-xl font-semibold tracking-tight">
          Your data at a glance
        </h2>
        {/* On phones each row stacks, so nothing scrolls sideways. */}
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-muted max-sm:sr-only">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                What
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Why
              </th>
              <th scope="col" className="py-2 font-medium">
                How long
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Name, email, password (hashed)", "Your account and sign-in", "Until you delete your account"],
              ["Profile picture", "Shown to you on your account", "Until you remove it or delete your account"],
              ["Sign-in sessions: IP address and browser", "Keeping you signed in, spotting sign-ins that aren't yours", "7 days, renewed while you use MarketLab"],
              ["Portfolio, trades and notes, watchlist, alerts, backtests, lessons, badges", "What MarketLab does for you", "Until you erase it or delete your account"],
              ["Leaderboard and competition entries", "Taking part, if you choose to (public: display name and results)", "Until you leave or delete your account"],
              ["Guest data (no account)", "Remembering your portfolio on this browser", `Until you delete it, or after ${guestDays} days unused`],
              ["Alert emails and push devices", "Notifications you turned on", "Until you turn them off"],
              ["IP address counts", "Stopping password guessing and overuse", "Under a day"],
              ["Page visits and speed", "Seeing what's used and what's slow, only if you allow analytics", "As set by Vercel; no cookies, nothing linked to your account"],
            ].map(([what, why, howLong]) => (
              <tr key={what} className="border-t border-border align-top max-sm:block max-sm:py-2">
                <th scope="row" className="py-2 pr-4 font-medium max-sm:block max-sm:p-0">
                  {what}
                </th>
                <td className="py-2 pr-4 max-sm:mt-1 max-sm:block max-sm:p-0">{why}</td>
                <td className="py-2 text-muted max-sm:mt-1 max-sm:block max-sm:p-0">{howLong}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <nav aria-labelledby="contents" className="mt-10 rounded-2xl bg-foreground/[0.04] p-5">
        <h2 id="contents" className="text-sm font-semibold">
          The full policy
        </h2>
        <ol className="mt-2 grid list-decimal gap-x-8 gap-y-1 pl-5 text-sm sm:grid-cols-2">
          {CONTENTS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className="tap text-accent underline-offset-2 hover:underline">
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="what" title="What we keep">
        <p>
          <strong>Your account</strong>, if you make one: your name, email address and whether you&apos;ve confirmed it, and your password, stored only as a one-way hash
          (nobody, including us, can read it back). If you sign in with Google, Google tells us your name, email address and Google account ID, and gives us sign-in
          tokens, which are stored with your account; we use them only to sign you in, never to read anything else from your Google account. We don&apos;t keep your
          Google profile photo.
        </p>
        <p>
          <strong>Your profile picture</strong>, if you add one. It&apos;s cropped and re-drawn in your browser before upload, which removes hidden details such as where a
          photo was taken. Only you see it.
        </p>
        <p>
          <strong>Sign-in sessions</strong>: for each device you sign in on, when you signed in, the IP address and the browser it was from (its &quot;user agent&quot;). This
          is what keeps you signed in, and helps spot sign-ins that aren&apos;t yours.
        </p>
        <p>
          <strong>What you do in MarketLab</strong>: your simulated portfolio, trades and the reasons and notes you add to them, orders, options, watchlist, price alerts,
          saved backtests and screens, lesson answers and scores, badges, and competition entries. If you use MarketLab without an account, the same is kept for a
          &quot;guest&quot;, known only by a random ID in a cookie in your browser.
        </p>
        <p>
          <strong>Notifications</strong>, only if you turn them on: whether you want alert emails, and for push alerts, the address your browser&apos;s push service gave us
          for your device, with its encryption keys.
        </p>
        <p>
          <strong>Abuse protection</strong>: to stop password guessing and overuse, we count requests per IP address for short periods (a minute or so).
        </p>
        <p>
          <strong>Server logs</strong>: our host, Vercel, records requests (including IP addresses and the pages asked for) to run and secure the site, and keeps them only
          for a short time.
        </p>
        <p>
          <strong>Analytics, only if you allow them</strong>: Vercel Web Analytics and Speed Insights record which pages are visited and how fast they load, with the
          browser, device type and country. They set no cookies and never see your name, email or portfolio. Change your choice in{" "}
          <A href="/privacy/cookies">cookie settings</A>.
        </p>
        <p>We don&apos;t collect anything else: no advertising trackers, no social-media pixels, no location, no contacts.</p>
      </Section>

      <Section id="public" title="What other people can see">
        <p>
          Nothing, unless you choose to join the leaderboard or a monthly competition. Then everyone can see the display name you pick (never your email address), your
          simulated portfolio&apos;s value and return, your rank and your badges. You can leave, or erase your entries, at any time.
        </p>
      </Section>

      <Section id="why" title="Why we use it">
        <ul>
          <li>To provide MarketLab to you: your account, portfolio, lessons, alerts and competitions (needed to provide the service you asked for).</li>
          <li>To keep it secure and working: sessions, abuse protection and server logs (our legitimate interest in a safe, reliable site).</li>
          <li>To send the emails you need or asked for: confirming your address, account changes, and alert digests if you turn them on.</li>
          <li>To see what&apos;s used and what&apos;s slow, only with your consent: analytics.</li>
        </ul>
        <p>We never sell your data, share it for advertising, or use it to make decisions about you.</p>
      </Section>

      <Section id="who" title="Who else handles it">
        <p>Only the services MarketLab runs on, each only to do its job for us:</p>
        <ul>
          <li>
            <strong>Vercel</strong>: hosts the website and its analysis service, and runs the analytics you allow.
          </li>
          <li>
            <strong>Turso</strong>: stores the database.
          </li>
          <li>
            <strong>Google</strong>: signs you in, if you choose &quot;Continue with Google&quot;, and delivers our emails (we send them through Gmail).
          </li>
          <li>
            <strong>Your browser&apos;s push service</strong> (Google, Mozilla or Apple, depending on your browser) carries push alerts to your device, if you turn them on.
            The alerts are encrypted so only your device can read them.
          </li>
        </ul>
        <p>
          Market prices and company filings come from outside data providers, but our server fetches them; nothing about you is sent to them. These services may handle
          data in the United States and other countries.
        </p>
      </Section>

      <Section id="how-long" title="How long we keep it">
        <ul>
          <li>Your account and what&apos;s in it: until you erase parts of it or delete the account. Deleting it removes everything straight away.</li>
          <li>A guest&apos;s data: until you delete it, or automatically once it&apos;s gone unused for {guestDays} days.</li>
          <li>Sign-in sessions: 7 days, renewed while you use MarketLab; removed when you sign out, and expired ones are deleted daily.</li>
          <li>Abuse-protection counts: deleted within a day.</li>
          <li>
            Database backups: so the database can be restored after a fault, our provider keeps earlier copies of it for a limited time, after which they&apos;re gone. Data you
            delete disappears from them when they expire.
          </li>
        </ul>
      </Section>

      <Section id="rights" title="Your choices and rights">
        <p>You can do all of these yourself, at any time, without asking us:</p>
        <ul>
          <li>
            <strong>See and download</strong> everything we keep about you, as one file: <A href="/account/data">Privacy and your data</A>.
          </li>
          <li>
            <strong>Correct</strong> your name, email address, password and picture: <A href="/account">your account</A>.
          </li>
          <li>
            <strong>Erase</strong> parts of your data, or <strong>delete your account</strong> and everything in it: <A href="/account/data">Privacy and your data</A>.
            Guests can delete everything their browser saved there too.
          </li>
          <li>
            <strong>Withdraw consent</strong> to analytics: <A href="/privacy/cookies">cookie settings</A>. We also honour your browser&apos;s Global Privacy Control signal.
          </li>
          <li>
            <strong>Stop emails and notifications</strong>: the alerts settings on your watchlist page, the unsubscribe link in any alert email, or your device&apos;s settings.
          </li>
        </ul>
        <p>
          Depending on where you live (for example under the GDPR in the EU and UK, or California&apos;s privacy laws), you may also have the right to object to how we use
          your data, to restrict it, and to complain to your local data protection authority.
          {contact ? (
            <>
              {" "}
              For anything you can&apos;t do yourself, or any question about privacy, email{" "}
              <a href={`mailto:${contact}`} className="text-accent underline-offset-2 hover:underline">
                {contact}
              </a>
              .
            </>
          ) : null}
        </p>
      </Section>

      <Section id="security" title="Keeping it safe">
        <p>
          The site is served only over HTTPS. Passwords are hashed, sign-in cookies can&apos;t be read by the page&apos;s scripts, sign-ins are rate-limited, and changing your
          email address or deleting your account needs your password (or a fresh sign-in with Google). Every request checks that it only touches your own data.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>MarketLab isn&apos;t meant for children under 13, and we don&apos;t knowingly keep data about them. If you think a child has made an account, it can be deleted from its account page.</p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          When what we keep or why changes, we update this page and the date at the top. If a change needs your consent, such as a new kind of analytics, we ask again
          before it applies to you.
        </p>
      </Section>
    </main>
  );
}
