import { MemoView } from "@/components/memo-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMemos } from "@/lib/gas";
import type { MemoRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  let memos: MemoRecord[] = [];
  let error: unknown = null;
  try {
    memos = await fetchMemos();
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
    </div>
  );
}
