import { formatKwh, formatYearMonthLabel, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ElectricityTrendPoint } from "@/lib/types";

interface ElectricityHistoryTableProps {
  trend: ElectricityTrendPoint[];
}

export function ElectricityHistoryTable({ trend }: ElectricityHistoryTableProps) {
  if (trend.length === 0) {
    return <p className="text-sm text-muted-foreground">まだデータがありません。</p>;
  }

  const rows = [...trend].sort((a, b) => b.year_month.localeCompare(a.year_month));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">年月</th>
            <th className="py-2 pr-4 text-right font-medium">売電収入</th>
            <th className="py-2 pr-4 text-right font-medium">売電量</th>
            <th className="py-2 pr-4 text-right font-medium">買電支出</th>
            <th className="py-2 pr-4 text-right font-medium">買電量</th>
            <th className="py-2 pl-4 text-right font-medium">収支</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year_month} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-4">{formatYearMonthLabel(r.year_month)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatYen(r.income)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                {r.income_kwh !== null ? formatKwh(r.income_kwh) : "—"}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatYen(r.expense)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                {r.expense_kwh !== null ? formatKwh(r.expense_kwh) : "—"}
              </td>
              <td
                className={cn(
                  "py-2 pl-4 text-right tabular-nums font-medium",
                  r.net > 0 && "text-success-text",
                  r.net < 0 && "text-destructive"
                )}
              >
                {formatYen(r.net)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
