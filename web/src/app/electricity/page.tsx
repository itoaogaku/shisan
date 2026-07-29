import { ElectricityView } from "@/components/electricity-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentYearMonth } from "@/lib/format";
import { fetchElectricityData, fetchElectricityTrend } from "@/lib/gas";
import type { ElectricityRecord, ElectricityTrendPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ElectricityPage() {
  const yearMonth = currentYearMonth();

  let initialData: ElectricityRecord | null = null;
  let trend: ElectricityTrendPoint[] = [];
  let error: unknown = null;
  try {
    [initialData, trend] = await Promise.all([fetchElectricityData(yearMonth), fetchElectricityTrend()]);
  } catch (err) {
    error = err;
  }

  if (error) {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">売電・買電</h1>
        <p className="text-sm text-muted-foreground">
          太陽光発電の売電収入と、電力会社からの買電支出を月ごとに記録します（資産管理とは別に集計されます）。
        </p>
      </div>
      <ElectricityView initialYearMonth={yearMonth} initialData={initialData} trend={trend} />
    </div>
  );
}
