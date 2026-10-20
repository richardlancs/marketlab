import { GLOSSARY, type TermKey } from "../glossary";

export type Segment = { kind: "text"; text: string } | { kind: "term"; term: TermKey; text: string };

const LINK = /\[\[([a-zA-Z]+)(?:\|([^\]]+))?\]\]/g;

const isTerm = (key: string): key is TermKey => Object.hasOwn(GLOSSARY, key);

/**
 * Splits lesson text into plain text and links to other lessons:
 * `[[sharpe]]` becomes a link labeled "Sharpe ratio", and
 * `[[sharpe|this ratio]]` a link labeled "this ratio". An unknown key is
 * left as plain text (and caught by the lesson tests).
 */
export function parseRichText(input: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of input.matchAll(LINK)) {
    const [whole, key, label] = match;
    if (match.index > last) segments.push({ kind: "text", text: input.slice(last, match.index) });
    segments.push(isTerm(key) ? { kind: "term", term: key, text: label ?? GLOSSARY[key].title } : { kind: "text", text: label ?? key });
    last = match.index + whole.length;
  }
  if (last < input.length) segments.push({ kind: "text", text: input.slice(last) });
  return segments;
}

/** The terms a piece of text links to, including unknown keys (for the tests). */
export const linkedKeys = (input: string): string[] => [...input.matchAll(LINK)].map((m) => m[1]);

/** The text as a reader sees it, without the link markup. */
export const plainText = (input: string) => parseRichText(input).map((s) => s.text).join("");
