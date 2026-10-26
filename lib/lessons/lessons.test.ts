import { describe, expect, it } from "vitest";
import { PRESETS } from "../analytics/screener";
import { parseShareFragment } from "../backtest/share";
import { GLOSSARY, GROUPS, TERM_KEYS, type TermKey } from "../glossary";
import { CATALOG } from "../market/catalog";
import { LESSON_SLUGS, LESSONS, lessonText, neighbors, readingMinutes, termForSlug, wordCount } from "./index";
import { linkedKeys, parseRichText, plainText } from "./rich-text";
import type { Lesson } from "./types";

/** Pages a lesson may link to (besides other lessons and stock pages). */
const APP_PAGES = ["/", "/stocks", "/watchlist", "/portfolio", "/backtest", "/screener", "/leaderboard", "/learn", "/options"];
/** Tabs a lesson may open with a #fragment (a stock page's tabs, and the portfolio's). */
// Tabs a link may open (components/ui/tabs.tsx ids).
const PAGE_TABS: Record<string, string[]> = { "/stocks/": ["overview", "trade", "analysis", "company", "news"], "/portfolio": ["holdings", "orders", "performance", "risk", "activity", "compete"], "/backtest": ["strategies", "ml"] };
const isKnownSymbol = (symbol: string) => CATALOG.some((s) => s.symbol === symbol);

const lessons = Object.entries(LESSONS) as [TermKey, Lesson][];

/** Every string in a lesson, so links can be checked wherever they appear. */
function allText(lesson: Lesson): string[] {
  return [
    ...lesson.why,
    ...lesson.how.paragraphs,
    lesson.how.formula?.expression ?? "",
    lesson.how.formula?.reading ?? "",
    lesson.example.setup,
    ...lesson.example.steps,
    lesson.example.result,
    ...lesson.reading.flatMap((r) => [r.label, r.meaning]),
    ...lesson.realWorld,
    ...lesson.mistakes,
    ...lesson.inMarketLab.flatMap((l) => [l.label, l.text]),
    ...lesson.quiz.flatMap((q) => [q.prompt, ...q.choices, q.explanation]),
  ];
}

describe("lesson addresses", () => {
  it("are unique, lowercase and lead back to their term", () => {
    const slugs = Object.values(LESSON_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const term of TERM_KEYS) {
      expect(LESSON_SLUGS[term]).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(termForSlug(LESSON_SLUGS[term])).toBe(term);
    }
    expect(termForSlug("not-a-lesson")).toBeUndefined();
    expect(termForSlug("constructor")).toBeUndefined();
  });
});

describe("the learning path", () => {
  it("lists every group, in order, without going back to an earlier group", () => {
    const groups = TERM_KEYS.map((t) => GLOSSARY[t].group);
    expect([...new Set(groups)]).toEqual([...GROUPS]);
  });

  it("links each lesson to its neighbors", () => {
    expect(neighbors(TERM_KEYS[0]).previous).toBeUndefined();
    expect(neighbors(TERM_KEYS[1])).toEqual({ previous: TERM_KEYS[0], next: TERM_KEYS[2] });
    expect(neighbors(TERM_KEYS[TERM_KEYS.length - 1]).next).toBeUndefined();
  });
});

describe("every term", () => {
  it("has a lesson", () => {
    expect(TERM_KEYS.filter((t) => !LESSONS[t])).toEqual([]);
  });
});

describe.each(lessons)("the %s lesson", (term, lesson) => {
  it("is a 3 to 5 minute read", () => {
    const words = wordCount(lessonText(term, lesson));
    expect(words, `${words} words`).toBeGreaterThanOrEqual(3 * 220 - 110);
    expect(words, `${words} words`).toBeLessThanOrEqual(5 * 220 + 110);
    expect(readingMinutes(term, lesson)).toBeGreaterThanOrEqual(3);
    expect(readingMinutes(term, lesson)).toBeLessThanOrEqual(5);
  });

  it("has every part filled in", () => {
    expect(lesson.why.length).toBeGreaterThanOrEqual(1);
    expect(lesson.how.paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(lesson.example.steps.length).toBeGreaterThanOrEqual(2);
    expect(lesson.reading.length).toBeGreaterThanOrEqual(2);
    expect(lesson.realWorld.length).toBeGreaterThanOrEqual(2);
    expect(lesson.mistakes.length).toBeGreaterThanOrEqual(2);
    expect(lesson.inMarketLab.length).toBeGreaterThanOrEqual(1);
    for (const text of allText(lesson)) expect(text).not.toMatch(/^\s|\s$|\s{2}/);
  });

  it("has a short quiz covering terminology, use and the real world", () => {
    expect(lesson.quiz.length).toBeGreaterThanOrEqual(3);
    expect(lesson.quiz.length).toBeLessThanOrEqual(5);
    expect(new Set(lesson.quiz.map((q) => q.kind))).toEqual(new Set(["Terminology", "Using it", "Real world"]));
    for (const q of lesson.quiz) {
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.choices.length).toBeLessThanOrEqual(4);
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length).toBe(true);
      expect(q.explanation.length).toBeGreaterThan(20);
    }
  });

  it("links only to lessons and pages that exist", () => {
    for (const text of allText(lesson)) for (const key of linkedKeys(text)) expect(Object.hasOwn(GLOSSARY, key), `[[${key}]]`).toBe(true);
    expect(lesson.related.length).toBeGreaterThanOrEqual(2);
    expect(lesson.related.length).toBeLessThanOrEqual(4);
    expect(lesson.related).not.toContain(term);
    expect(new Set(lesson.related).size).toBe(lesson.related.length);
    for (const { href } of lesson.inMarketLab) {
      // The Backtest page's fragment is either one of its tabs or a shared run's settings.
      if (href.startsWith("/backtest#")) {
        if (!PAGE_TABS["/backtest"].includes(href.slice("/backtest#".length))) expect(parseShareFragment(href.slice("/backtest".length), isKnownSymbol), href).not.toBeNull();
      }
      else if (href.startsWith("/portfolio#")) expect(PAGE_TABS["/portfolio"], href).toContain(href.slice("/portfolio#".length));
      else if (href.startsWith("/stocks/")) {
        const [symbol, tab] = href.slice("/stocks/".length).split("#");
        expect(isKnownSymbol(symbol), href).toBe(true);
        if (tab !== undefined) expect(PAGE_TABS["/stocks/"], href).toContain(tab);
      }
      else if (href.startsWith("/learn/")) expect(termForSlug(href.slice("/learn/".length)), href).toBeDefined();
      else if (href.startsWith("/screener?preset=")) expect(PRESETS.map((p) => p.id), href).toContain(href.slice("/screener?preset=".length));
      else expect(APP_PAGES, href).toContain(href);
    }
  });
});

describe("lesson text", () => {
  it("turns [[term]] into links labeled with the term's title, or with given words", () => {
    expect(parseRichText("See [[sharpe]] and [[maxDrawdown|the worst fall]].")).toEqual([
      { kind: "text", text: "See " },
      { kind: "term", term: "sharpe", text: "Sharpe ratio" },
      { kind: "text", text: " and " },
      { kind: "term", term: "maxDrawdown", text: "the worst fall" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves unknown keys as text, and reads as plain text without markup", () => {
    expect(parseRichText("[[nope]]")).toEqual([{ kind: "text", text: "nope" }]);
    expect(plainText("A [[beta|stock's beta]] of 1.2")).toBe("A stock's beta of 1.2");
    expect(linkedKeys("[[a]] and [[b|x]]")).toEqual(["a", "b"]);
  });
});
