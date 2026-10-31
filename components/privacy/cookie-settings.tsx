"use client";

import { useState } from "react";
import { ESSENTIAL_STORAGE, PREFERENCE_STORAGE, type StorageItem } from "@/lib/consent";
import { Card } from "@/components/ui/card";
import { saveConsent, useConsent, useGpc } from "./consent";

/** The cookie settings page (app/privacy/cookies): the analytics choice, then everything kept in the browser. */
export function CookieSettings({ available }: { available: boolean }) {
  const consent = useConsent();
  const gpc = useGpc();
  const [saved, setSaved] = useState(false);
  const allowed = consent?.analytics === true;

  function choose(analytics: boolean) {
    saveConsent(analytics);
    setSaved(true);
  }

  return (
    <div className="mt-8 grid max-w-3xl gap-6">
      <Card aria-labelledby="analytics-heading">
        <h2 id="analytics-heading" className="text-lg font-semibold">
          Analytics
        </h2>
        <p className="mt-2 text-sm text-muted">
          Vercel Web Analytics counts page visits and Speed Insights measures how fast pages load, so we can see what&apos;s used and what&apos;s slow. They set no cookies,
          don&apos;t follow you to other sites, and never see your name, email or portfolio. They&apos;re off unless you turn them on.
        </p>
        {!available && <p className="mt-2 text-sm text-muted">This copy of MarketLab doesn&apos;t run them at all, so your choice only applies on the live site.</p>}
        {gpc && !consent && <p className="mt-2 text-sm text-muted">Your browser sends the Global Privacy Control signal, so they stay off unless you choose otherwise here.</p>}
        <fieldset className="mt-4">
          <legend className="sr-only">Analytics</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="analytics" checked={consent !== undefined && !allowed} onChange={() => choose(false)} />
            Off: essential cookies only
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="radio" name="analytics" checked={allowed} onChange={() => choose(true)} />
            On: allow analytics
          </label>
        </fieldset>
        <p role="status" className="mt-2 min-h-5 text-sm text-gain">
          {saved && (allowed ? "Saved: analytics are on." : "Saved: analytics are off.")}
        </p>
      </Card>

      <StorageTable
        title="Essential"
        intro="Needed for MarketLab to work, so they can't be switched off. None tracks you or is shared with anyone."
        items={ESSENTIAL_STORAGE}
      />
      <StorageTable
        title="Your preferences"
        intro="Kept in your browser for features you use, and only once you use them. Your theme and chart period can be cleared from Privacy and your data."
        items={PREFERENCE_STORAGE}
      />
    </div>
  );
}

function StorageTable({ title, intro, items }: { title: string; intro: string; items: StorageItem[] }) {
  return (
    <Card aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{intro}</p>
      {/* On phones each row stacks (name, purpose, how long), so nothing scrolls sideways. */}
      <table className="mt-4 w-full text-left text-sm">
        <thead className="text-xs text-muted max-sm:sr-only">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">
              Name
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              What it&apos;s for
            </th>
            <th scope="col" className="py-2 font-medium">
              How long
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.name} className="border-t border-border align-top max-sm:block max-sm:py-2">
              <th scope="row" className="py-2 pr-4 font-normal max-sm:block max-sm:p-0">
                <span className="font-mono text-xs break-all">{item.name}</span>
                <span className="block text-xs text-muted">{item.kind}</span>
              </th>
              <td className="py-2 pr-4 max-sm:mt-1 max-sm:block max-sm:p-0">{item.purpose}</td>
              <td className="py-2 text-muted max-sm:mt-1 max-sm:block max-sm:p-0">{item.lasts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
