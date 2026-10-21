import type { ComponentProps } from "react";

/**
 * The surface every dashboard section sits on. A very faint top-to-bottom
 * gradient and a 1px inner highlight along the top edge give it a little depth
 * without a heavy shadow. `...props` passes through anything else, such as
 * `style` or `aria-labelledby`.
 */
export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return (
    <section
      className={`rounded-2xl border border-border bg-linear-to-b from-surface-raised to-surface p-5 shadow-sm max-sm:px-4 shadow-black/[0.03] dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)] ${className}`}
      {...props}
    />
  );
}
