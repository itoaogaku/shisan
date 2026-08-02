import { formatYearMonthLabel, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/lib/types";

interface NetWorthHistoryTableProps {
  trend: TrendPoint[];
}

interface NetWorthRow {
  year_month: string;
  net_worth: number;
}

export function NetWorthHistoryTable({ trend }: NetWorthHistoryTableProps) {
  if (trend.length === 0) {
    return <p className="text-sm text-muted-foreground">まだデータがありません。</p>;
  }

  const rows: NetWorthRow[] = trend
    .map((t) => ({
      year_month: t.year_month,
      net_worth: t.total_assets - (t.category_totals?.カード ?? t.card_total ?? 0),
    }))
    .sort((a, b) => b.year_month.localeCompare(a.year_month))
    .slice(0, 12);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">年月</th>
            <th className="py-2 pr-4 text-right font-medium">推定資産</th>
            <th className="py-2 pl-4 text-right font-medium">前月比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const diff = prev ? r.net_worth - prev.net_worth : null;
            return (
              <tr key={r.year_month} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4">{formatYearMonthLabel(r.year_month)}</td>
                <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums font-medium">
                  {formatYen(r.net_worth)}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap py-2 pl-4 text-right tabular-nums",
                    diff === null && "text-muted-foreground",
                    diff !== null && diff > 0 && "text-success-text",
                    diff !== null && diff < 0 && "text-destructive"
                  )}
                >
                  {diff === null ? "—" : diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${formatYen(diff)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
