import { LinkTabs } from "@/components/ui/link-tabs";

/** The screener's two pages: today's screen, and the Momentum leaders screen tested over time. */
export function ScreenerTabs({ current }: { current: "/screener" | "/screener/history" }) {
  return (
    <LinkTabs
      label="Screener views"
      current={current}
      tabs={[
        { href: "/screener", label: "Today" },
        { href: "/screener/history", label: "Over time" },
      ]}
    />
  );
}
