import { LearnProgressProvider } from "@/components/learn/learn-progress-provider";

/** The Learn pages share lesson progress (quiz answers, scores, passes), loaded once per visit. */
export default function LearnLayout({ children }: LayoutProps<"/learn">) {
  return <LearnProgressProvider>{children}</LearnProgressProvider>;
}
