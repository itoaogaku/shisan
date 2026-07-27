import { DashboardView } from "@/components/dashboard-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMonthlyData, fetchTrend, fetchYearMonths } from "@/lib/gas";
import { currentYearMonth } from "@/lib/format";
import type { MonthlyEntry, TrendPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

interface DashboardData {
  yearMonthOptions: string[];
  selectedYearMonth: string;
  entries: MonthlyEntry[];
  trend: TrendPoint[];
}

async function loadDashboardData(requestedYearMonth?: string): Promise<DashboardData> {
  const yearMonths = await fetchYearMonths();
  const latest = yearMonths.length > 0 ? yearMonths[yearMonths.length - 1] : currentYearMonth();
  const selectedYearMonth = requestedYearMonth ?? latest;
  const yearMonthOptions = Array.from(new Set([...yearMonths, selectedYearMonth])).sort().reverse();

  const [trend, entries] = await Promise.all([fetchTrend(), fetchMonthlyData(selectedYearMonth)]);

  return { yearMonthOptions, selectedYearMonth, entries, trend };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const { ym } = await searchParams;

  let data: DashboardData | null = null;
  let error: unknown = null;
  try {
    data = await loadDashboardData(ym);
  } catch (err) {
    error = err;
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">GAS APIに接続できません</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            環境変数 <code className="rounded bg-muted px-1 py-0.5">GAS_API_URL</code>（および必要なら{" "}
            <code className="rounded bg-muted px-1 py-0.5">GAS_API_TOKEN</code>）が正しく設定されているか確認してください。
          </p>
          <p className="text-destructive">{String(error)}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <DashboardView
      yearMonthOptions={data.yearMonthOptions}
      selectedYearMonth={data.selectedYearMonth}
      entries={data.entries}
      trend={data.trend}
    />
  );
}
