import { LinkTabs } from "@/components/ui/link-tabs";

const tabs = [
  { href: "/account", label: "Profile and sign-in" },
  { href: "/account/data", label: "Privacy and your data" },
];

/** The account pages' title and tabs. */
export function AccountHeader({ current, intro }: { current: "/account" | "/account/data"; intro: string }) {
  return (
    <div className="animate-fade-up">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your account</h1>
      <p className="mt-2 text-muted">{intro}</p>
      <LinkTabs tabs={tabs} current={current} label="Account pages" />
    </div>
  );
}
