"use client";

import { useEffect, useState } from "react";

export interface ContentsItem {
  id: string;
  label: string;
}

/**
 * "On this page": links to each section of a lesson, with the one being read
 * highlighted. Shown in the left margin on wide screens; it sticks below the
 * header while the lesson scrolls.
 */
export function LessonContents({ items }: { items: ContentsItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    // A section counts as "being read" once its heading passes the upper third of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -66% 0px" },
    );
    for (const { id } of items) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="sticky top-24 text-sm">
      <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">On this page</p>
      <ul className="space-y-0.5 border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent aria-[current]:border-accent aria-[current]:font-medium aria-[current]:text-foreground"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
