import type { Metadata } from "next";
import { Suspense } from "react";
import { LearnIndex, type LessonCard } from "@/components/learn/learn-index";
import { GLOSSARY, TERM_KEYS } from "@/lib/glossary";
import { getLesson, lessonHref, readingMinutes } from "@/lib/lessons";

export const metadata: Metadata = { title: "Learn — MarketLab", description: "Short lessons on the ideas behind investing, each with an example, a demo and a quick test." };

/** Every lesson, in learning-path order. Each card links to its lesson at /learn/<slug>. */
export default function LearnPage() {
  const cards: LessonCard[] = TERM_KEYS.flatMap((term) => {
    const lesson = getLesson(term);
    if (!lesson) return [];
    const { title, short, group } = GLOSSARY[term];
    return [{ term, href: lessonHref(term), title, short, group, minutes: readingMinutes(term, lesson), interactive: !!lesson.demo }];
  });
  const totalMinutes = cards.reduce((sum, c) => sum + c.minutes, 0);

  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learn</h1>
        <p className="mt-2 max-w-2xl text-muted">
          {cards.length} short lessons on the ideas behind investing, from compounding to backtesting. Each takes 3–5 minutes, with a worked example, an interactive demo and an
          optional quick test. About {Math.round(totalMinutes / 5) * 5} minutes in all, in a suggested order.
        </p>
      </div>
      {/* The group filter reads the address (?group=…), which isn't known while the page is pre-rendered. */}
      <Suspense>
        <LearnIndex cards={cards} />
      </Suspense>
    </main>
  );
}
