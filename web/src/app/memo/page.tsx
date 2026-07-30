import { AnnualMemoView } from "@/components/annual-memo-view";
import { MemoView } from "@/components/memo-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAnnualMemos, fetchMemos } from "@/lib/gas";
import type { AnnualMemoRecord, MemoRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  let memos: MemoRecord[] = [];
  let annualMemos: AnnualMemoRecord[] = [];
  let error: unknown = null;
  try {
    [memos, annualMemos] = await Promise.all([fetchMemos(), fetchAnnualMemos()]);
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
        <h1 className="text-2xl font-semibold">メモ</h1>
        <p className="text-sm text-muted-foreground">
          奨学金の引き落としなど、口座ごとの定期・都度の入出金を記録できます（資産管理とは別枠です）。
        </p>
      </div>
      <MemoView initialMemos={memos} />

      <div className="border-t border-border pt-8">
        <h2 className="text-xl font-semibold">年間の支払い</h2>
        <p className="text-sm text-muted-foreground">
          自動車税・固定資産税の振込など、毎年決まった時期に発生する支払いを記録できます。
        </p>
        <div className="mt-6">
          <AnnualMemoView initialAnnualMemos={annualMemos} />
        </div>
      </div>
    </div>
  );
}
