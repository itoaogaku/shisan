import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKwh, formatYearMonthLabel, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ElectricityTrendPoint } from "@/lib/types";

interface ElectricitySummaryProps {
  trend: ElectricityTrendPoint[];
}

interface Summary {
  sum: number;
  avg: number;
  count: number;
}

function summarize(values: (number | null)[]): Summary {
  const nonNull = values.filter((v): v is number => v !== null);
  const sum = nonNull.reduce((s, v) => s + v, 0);
  const avg = nonNull.length > 0 ? sum / nonNull.length : 0;
  return { sum, avg, count: nonNull.length };
}

export function ElectricitySummary({ trend }: ElectricitySummaryProps) {
  const sorted = [...trend].sort((a, b) => a.year_month.localeCompare(b.year_month));
  const last12 = sorted.slice(-12);

  if (last12.length === 0) {
    return null;
  }

  const income = summarize(last12.map((r) => r.income));
  const expense = summarize(last12.map((r) => r.expense));
  const net = summarize(last12.map((r) => r.net));
  const incomeKwh = summarize(last12.map((r) => r.income_kwh));
  const expenseKwh = summarize(last12.map((r) => r.expense_kwh));

  const rangeLabel =
    last12.length > 1
      ? `${formatYearMonthLabel(last12[0].year_month)}〜${formatYearMonthLabel(last12[last12.length - 1].year_month)}`
      : formatYearMonthLabel(last12[0].year_month);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-foreground">
          直近{last12.length}ヶ月のまとめ（{rangeLabel}）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="売電収入 合計" value={income.sum} hint={`月平均 ${formatYen(income.avg)}`} />
          <StatCard label="買電支出 合計" value={expense.sum} hint={`月平均 ${formatYen(expense.avg)}`} />
          <StatCard
            label="収支 合計"
            value={net.sum}
            emphasis
            valueClassName={cn(net.sum > 0 && "text-success-text", net.sum < 0 && "text-destructive")}
            hint={`月平均 ${formatYen(net.avg)}`}
          />
        </div>
        {(incomeKwh.count > 0 || expenseKwh.count > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm text-muted-foreground">売電量 合計</p>
              <p className="text-xl font-semibold">{formatKwh(incomeKwh.sum)}</p>
              <p className="text-xs text-muted-foreground">月平均 {formatKwh(incomeKwh.avg)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm text-muted-foreground">買電量 合計</p>
              <p className="text-xl font-semibold">{formatKwh(expenseKwh.sum)}</p>
              <p className="text-xs text-muted-foreground">月平均 {formatKwh(expenseKwh.avg)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
