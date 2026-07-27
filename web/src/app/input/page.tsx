import { MonthlyForm } from "@/components/monthly-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentYearMonth } from "@/lib/format";
import { fetchMonthlyData } from "@/lib/gas";
import type { MonthlyEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InputPage() {
  const yearMonth = currentYearMonth();

  let initialEntries: MonthlyEntry[] = [];
  let error: unknown = null;
  try {
    initialEntries = await fetchMonthlyData(yearMonth);
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
        <h1 className="text-2xl font-semibold">月次データ入力</h1>
        <p className="text-sm text-muted-foreground">
          年月を選び、口座ごとの月末残高・カードの月次支払額を入力してください。空欄の項目は保存されません。
        </p>
        <p className="mt-1 text-sm text-muted-foreground">毎月1〜5日ごろに更新してください。</p>
      </div>
      <MonthlyForm initialYearMonth={yearMonth} initialEntries={initialEntries} />
    </div>
  );
}
