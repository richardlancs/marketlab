import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LessonContents, type ContentsItem } from "@/components/learn/lesson-contents";
import { LessonDemo } from "@/components/learn/demos";
import { LessonQuiz } from "@/components/learn/lesson-quiz";
import { RichText } from "@/components/learn/rich-text";
import { Card } from "@/components/ui/card";
import { GLOSSARY, TERM_KEYS, type TermKey } from "@/lib/glossary";
import { getLesson, LESSON_SLUGS, lessonHref, neighbors, readingMinutes, termForSlug, type Lesson } from "@/lib/lessons";

/** Every lesson is built ahead of time (at `npm run build`). proxy.ts answers any other /learn/… address with a 404. */
export async function generateStaticParams() {
  return TERM_KEYS.map((term) => ({ slug: LESSON_SLUGS[term] }));
}

export async function generateMetadata(props: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const term = termForSlug(slug);
  if (!term) return { title: "Lesson not found — MarketLab" };
  const { title, short } = GLOSSARY[term];
  return { title: `${title} — Learn — MarketLab`, description: short };
}

/**
 * The shell (the link back to Learn) shows the moment a link is clicked; the
 * lesson itself needs the address, so it's behind Suspense, like stock pages.
 * Every lesson is pre-rendered, so the skeleton only shows during client
 * navigation, if at all.
 */
export default function LessonPage(props: PageProps<"/learn/[slug]">) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <Suspense fallback={<LessonSkeleton />}>
        <LessonDetails params={props.params} />
      </Suspense>
    </main>
  );
}

async function LessonDetails({ params }: { params: PageProps<"/learn/[slug]">["params"] }) {
  const { slug } = await params;
  const term = termForSlug(slug);
  const lesson = term && getLesson(term);
  // proxy.ts already 404s unknown addresses; this is a fallback.
  if (!term || !lesson) notFound();

  const { title, short, more, group } = GLOSSARY[term];
  const position = TERM_KEYS.indexOf(term) + 1;
  const sections = sectionsOf(lesson);

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden lg:block">
        <LessonContents items={sections.map(({ id, label }) => ({ id, label }))} />
      </aside>

      <article className="min-w-0 max-w-3xl">
        <nav aria-label="Breadcrumb" className="animate-fade-up text-sm text-muted">
          <Link href="/learn" className="tap text-accent hover:underline">
            Learn
          </Link>
          <span aria-hidden className="mx-1.5">
            ›
          </span>
          <Link href={`/learn?group=${encodeURIComponent(group)}`} className="tap hover:text-foreground hover:underline">
            {group}
          </Link>
        </nav>

        <header className="mt-3 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-lg text-foreground/90">{short}</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>{readingMinutes(term, lesson)} min read</span>
            <span aria-hidden>·</span>
            <span>
              Lesson {position} of {TERM_KEYS.length}
            </span>
            {lesson.demo && (
              <>
                <span aria-hidden>·</span>
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Interactive</span>
              </>
            )}
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-surface-raised p-4 text-sm sm:p-5">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">In short</p>
            <p className="mt-1.5">{more}</p>
          </div>
        </header>

        <div className="mt-10 space-y-12">
          {sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
              <h2 id={`${section.id}-heading`} className="text-xl font-semibold tracking-tight">
                {section.label}
              </h2>
              <div className="mt-4">{section.render(term)}</div>
            </section>
          ))}
        </div>

        <LessonNeighbors term={term} />
      </article>
    </div>
  );
}

interface Section extends ContentsItem {
  render: (term: TermKey) => ReactNode;
}

const prose = "space-y-4 leading-relaxed";

/** The parts of a lesson, in order. A part only appears if the lesson has it. */
function sectionsOf(lesson: Lesson): Section[] {
  const sections: (Section | false)[] = [
    {
      id: "why",
      label: "Why it matters",
      render: () => (
        <div className={prose}>
          {lesson.why.map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))}
        </div>
      ),
    },
    {
      id: "how",
      label: "How it works",
      render: () => (
        <div className={prose}>
          {lesson.how.paragraphs.map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))}
          {lesson.how.formula && (
            <figure className="rounded-2xl border border-accent/20 bg-accent/5 p-4 sm:p-5">
              <figcaption className="text-xs font-medium tracking-wide text-accent uppercase">Formula</figcaption>
              <p className="mt-2 font-mono text-sm leading-relaxed break-words">{lesson.how.formula.expression}</p>
              <p className="mt-2 text-sm text-muted">
                <RichText text={lesson.how.formula.reading} />
              </p>
            </figure>
          )}
        </div>
      ),
    },
    {
      id: "example",
      label: "A worked example",
      render: () => (
        <Card>
          <p className="leading-relaxed">
            <RichText text={lesson.example.setup} />
          </p>
          <ol className="mt-4 space-y-3">
            {lesson.example.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/5 font-mono text-xs font-semibold text-muted">
                  {i + 1}
                </span>
                <span className="pt-0.5">
                  <RichText text={step} />
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed">
            <span className="font-semibold">Result: </span>
            <RichText text={lesson.example.result} />
          </p>
        </Card>
      ),
    },
    !!lesson.demo && {
      id: "try-it",
      label: "Try it",
      render: () => <LessonDemo demo={lesson.demo!} />,
    },
    {
      id: "reading",
      label: "How to read it",
      render: () => (
        <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {lesson.reading.map((r, i) => (
            <div key={i} className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="font-semibold">
                <RichText text={r.label} />
              </dt>
              <dd className="text-sm leading-relaxed text-foreground/90">
                <RichText text={r.meaning} />
              </dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      id: "real-world",
      label: "In the real world",
      render: () => (
        <ul className="space-y-3">
          {lesson.realWorld.map((p, i) => (
            <li key={i} className="flex gap-3 leading-relaxed">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <RichText text={p} />
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "mistakes",
      label: "Common mistakes",
      render: () => (
        <ul className="space-y-3 rounded-2xl border border-loss/20 bg-loss/5 p-4 sm:p-5">
          {lesson.mistakes.map((m, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span aria-hidden className="mt-0.5 font-semibold text-loss">
                !
              </span>
              <span>
                <RichText text={m} />
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "in-marketlab",
      label: "See it in MarketLab",
      render: () => (
        <div className="grid gap-3 sm:grid-cols-2">
          {lesson.inMarketLab.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              className="group rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <p className="font-medium text-accent">
                {l.label} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                <RichText text={l.text} />
              </p>
            </Link>
          ))}
        </div>
      ),
    },
    {
      id: "test",
      label: "Test yourself",
      render: (term) => <LessonQuiz term={term} questions={lesson.quiz} />,
    },
    {
      id: "related",
      label: "Related lessons",
      render: () => (
        <ul className="flex flex-wrap gap-2">
          {lesson.related.map((r) => (
            <li key={r}>
              <Link
                href={lessonHref(r)}
                className="inline-block rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm transition-colors hover:border-accent/40 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              >
                {GLOSSARY[r].title}
              </Link>
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return sections.filter((s): s is Section => s !== false);
}

/** The previous and next lessons on the learning path. */
function LessonNeighbors({ term }: { term: TermKey }) {
  const { previous, next } = neighbors(term);
  const card = "group flex-1 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <nav aria-label="More lessons" className="mt-14 flex flex-col gap-3 border-t border-border pt-8 sm:flex-row">
      {previous ? (
        <Link href={lessonHref(previous)} className={card}>
          <p className="text-xs text-muted">← Previous</p>
          <p className="mt-1 font-medium group-hover:text-accent">{GLOSSARY[previous].title}</p>
        </Link>
      ) : (
        <div className="hidden flex-1 sm:block" />
      )}
      {next ? (
        <Link href={lessonHref(next)} className={`${card} sm:text-right`}>
          <p className="text-xs text-muted">Next →</p>
          <p className="mt-1 font-medium group-hover:text-accent">{GLOSSARY[next].title}</p>
        </Link>
      ) : (
        <Link href="/learn" className={`${card} sm:text-right`}>
          <p className="text-xs text-muted">You’ve reached the end</p>
          <p className="mt-1 font-medium group-hover:text-accent">Back to all lessons</p>
        </Link>
      )}
    </nav>
  );
}

/** Grey blocks in the shape of a lesson, shown while it loads. */
function LessonSkeleton() {
  const block = "animate-pulse rounded-lg bg-foreground/[0.06]";
  return (
    <div aria-busy className="max-w-3xl lg:ml-[15rem]">
      <span className="sr-only">Loading lesson…</span>
      <div className={`h-4 w-40 ${block}`} />
      <div className={`mt-4 h-10 w-72 ${block}`} />
      <div className={`mt-4 h-6 ${block}`} />
      <div className={`mt-6 h-24 ${block}`} />
      <div className={`mt-10 h-6 w-48 ${block}`} />
      <div className={`mt-4 h-32 ${block}`} />
    </div>
  );
}
