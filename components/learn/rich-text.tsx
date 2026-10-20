import Link from "next/link";
import { lessonHref } from "@/lib/lessons";
import { parseRichText } from "@/lib/lessons/rich-text";

/** Lesson text, with `[[term]]` shown as links to that term's lesson. */
export function RichText({ text }: { text: string }) {
  return parseRichText(text).map((segment, i) =>
    segment.kind === "term" ? (
      <Link key={i} href={lessonHref(segment.term)} className="font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
        {segment.text}
      </Link>
    ) : (
      segment.text
    ),
  );
}
