import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getFilings, getNews, type Filing, type NewsItem } from "@/lib/market";

const dateOf = (iso: string) => formatDate(Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

/**
 * What's been happening at the company: real SEC filings (public records,
 * shown everywhere), and with real prices on, Tiingo's news headlines (for
 * personal use only, so never on the public site). A Server Component inside
 * Suspense on the stock page, so a slow source never holds up the page.
 * Renders nothing when there's nothing to show.
 */
export async function StockNews({ symbol }: { symbol: string }) {
  const [filings, news] = await Promise.all([getFilings(symbol), getNews(symbol)]);
  if (!filings?.length && !news?.length) return null;
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {news && news.length > 0 && <NewsCard news={news} />}
      {filings && filings.length > 0 && <FilingsCard symbol={symbol} filings={filings} />}
    </div>
  );
}

function NewsCard({ news }: { news: NewsItem[] }) {
  return (
    <Card aria-labelledby="news">
      <h2 id="news" className="text-lg font-semibold tracking-tight">
        News
      </h2>
      <p className="mt-1 text-xs text-muted">Headlines from Tiingo, for your personal use.</p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {news.map((item) => (
          <li key={item.url} className="py-2">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-accent">
              {item.title}
            </a>
            <span className="block text-xs text-muted">
              {item.source && `${item.source} · `}
              {dateOf(item.published)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FilingsCard({ symbol, filings }: { symbol: string; filings: Filing[] }) {
  return (
    <Card aria-labelledby="filings">
      <h2 id="filings" className="text-lg font-semibold tracking-tight">
        Recent filings
      </h2>
      <p className="mt-1 text-xs text-muted">{symbol}&apos;s real reports and announcements to the SEC.</p>
      <ul className="mt-3 divide-y divide-border text-sm">
        {filings.map((f) => (
          <li key={f.url} className="flex items-baseline justify-between gap-3 py-2">
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:text-accent">
              <span className="font-medium">{f.description}</span>
              <span className="block text-xs text-muted">Form {f.form}</span>
            </a>
            <span className="shrink-0 text-xs text-muted tabular-nums">{dateOf(f.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
