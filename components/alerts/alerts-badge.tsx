"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useAccount } from "@/components/account/account-provider";
import { unseenAlerts } from "@/lib/alerts";
import { formatCurrency } from "@/lib/format";
import { describeAlert } from "@/lib/alerts";

/**
 * The header's bell: a count of alerts that triggered since you last looked.
 * While the site is open, each newly triggered alert also shows a browser
 * notification, if you've turned them on (once per alert per visit).
 */
export function AlertsBadge() {
  const { account } = useAccount();
  const notified = useRef(new Set<string>());
  const unseen = account ? unseenAlerts(account) : [];
  const unseenKey = unseen.map((a) => a.id).join(",");

  useEffect(() => {
    if (!account || !("Notification" in window) || Notification.permission !== "granted") return;
    for (const a of unseenAlerts(account)) {
      if (notified.current.has(a.id)) continue;
      notified.current.add(a.id);
      new Notification(`${a.symbol} ${describeAlert(a)}`, {
        body: `It closed at ${formatCurrency(a.triggerPrice ?? a.price)}.`,
        tag: a.id, // the browser shows each alert once, even from two tabs
      });
    }
    // Runs when the set of unseen alerts changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseenKey]);

  const count = unseen.length;
  return (
    <Link
      href="/watchlist#alerts"
      aria-label={count ? `Price alerts: ${count} new` : "Price alerts"}
      className="relative grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span aria-hidden className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-loss-fill px-1 text-xs leading-4 font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
