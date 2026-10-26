/**
 * Every lesson, the learning path through them, and reading times. The text
 * lives in ./content, one file per group of terms.
 */
import { GLOSSARY, TERM_KEYS, type TermKey } from "../glossary";
import { COMPANY_NUMBERS_LESSONS } from "./content/company-numbers";
import { INDICATORS_LESSONS } from "./content/indicators";
import { INVESTING_BASICS_LESSONS } from "./content/investing-basics";
import { MEASURING_RESULTS_LESSONS } from "./content/measuring-results";
import { OPTIONS_LESSONS } from "./content/options";
import { ORDERS_AND_TRADING_LESSONS } from "./content/orders-and-trading";
import { STRATEGIES_LESSONS } from "./content/strategies";
import { plainText } from "./rich-text";
import type { Lesson } from "./types";

export { LESSON_SLUGS, lessonHref, termForSlug } from "./slugs";
export type { DemoKey, Lesson, Question, QuestionKind } from "./types";

/** Every lesson, by term. The test "every term has a lesson" checks the content files add up to all of them. */
export const LESSONS: Partial<Record<TermKey, Lesson>> = {
  ...INVESTING_BASICS_LESSONS,
  ...MEASURING_RESULTS_LESSONS,
  ...ORDERS_AND_TRADING_LESSONS,
  ...COMPANY_NUMBERS_LESSONS,
  ...INDICATORS_LESSONS,
  ...OPTIONS_LESSONS,
  ...STRATEGIES_LESSONS,
};

export const getLesson = (term: TermKey): Lesson | undefined => LESSONS[term];

/** Average adult reading speed for explanatory text, in words a minute. */
const WORDS_PER_MINUTE = 220;

/** Everything a reader reads before the optional quiz. */
export function lessonText(term: TermKey, lesson: Lesson): string[] {
  const { short, more } = GLOSSARY[term];
  return [
    short,
    more,
    ...lesson.why,
    ...lesson.how.paragraphs,
    ...(lesson.how.formula ? [lesson.how.formula.expression, lesson.how.formula.reading] : []),
    lesson.example.setup,
    ...lesson.example.steps,
    lesson.example.result,
    ...lesson.reading.flatMap((r) => [r.label, r.meaning]),
    ...lesson.realWorld,
    ...lesson.mistakes,
    ...lesson.inMarketLab.map((l) => l.text),
  ].map(plainText);
}

export const wordCount = (texts: string[]) => texts.join(" ").split(/\s+/).filter(Boolean).length;

/** Reading time in whole minutes, at least 1. */
export const readingMinutes = (term: TermKey, lesson: Lesson) => Math.max(1, Math.round(wordCount(lessonText(term, lesson)) / WORDS_PER_MINUTE));

/** The lessons before and after this one on the learning path (the glossary's order). */
export function neighbors(term: TermKey): { previous?: TermKey; next?: TermKey } {
  const i = TERM_KEYS.indexOf(term);
  return { previous: TERM_KEYS[i - 1], next: TERM_KEYS[i + 1] };
}
