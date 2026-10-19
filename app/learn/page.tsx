import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { GLOSSARY, TERM_KEYS, type Term } from "@/lib/glossary";

export const metadata: Metadata = { title: "Learn — MarketLab" };

const GROUPS: Term["group"][] = ["Measuring results", "Orders and trading", "Strategies", "Company numbers"];

/** Every term MarketLab uses, in plain English. Each has an anchor (/learn#sharpe), which the ⓘ buttons link to. */
export default function LearnPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learn</h1>
        <p className="mt-2 text-muted">The terms used around MarketLab, in plain English. Look for the ⓘ next to a number to see one in place.</p>
      </div>
      <div className="mt-8 space-y-6">
        {GROUPS.map((group, i) => (
          <section key={group} aria-labelledby={`group-${i}`} style={{ animationDelay: `${(i + 1) * 60}ms` }} className="animate-fade-up">
            <h2 id={`group-${i}`} className="text-lg font-semibold tracking-tight">
              {group}
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {TERM_KEYS.filter((key) => GLOSSARY[key].group === group).map((key) => {
                const term: Term = GLOSSARY[key];
                return (
                  // scroll-mt: the anchor lands below the sticky header.
                  <Card key={key} id={key} className="scroll-mt-24 target:ring-2 target:ring-accent">
                    <h3 className="font-semibold">{term.title}</h3>
                    <p className="mt-1 text-sm">{term.short}</p>
                    <p className="mt-2 text-sm text-muted">{term.more}</p>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
