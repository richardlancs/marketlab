import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** The centered card layout shared by the sign-in and sign-up pages. */
export function AuthPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto grid w-full max-w-7xl flex-1 place-items-start px-4 py-12 sm:place-items-center sm:py-20">
      <div className="w-full max-w-sm animate-fade-up sm:mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">{intro}</p>
        <Card className="mt-6 p-6">{children}</Card>
      </div>
    </main>
  );
}
