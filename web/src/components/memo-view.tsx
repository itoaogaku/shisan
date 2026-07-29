"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { currentDate, formatDateLabel, formatYen } from "@/lib/format";
import type { MemoRecord } from "@/lib/types";

interface MemoViewProps {
  initialMemos: MemoRecord[];
}

export function MemoView({ initialMemos }: MemoViewProps) {
  const [memos, setMemos] = useState(initialMemos);
  const [date, setDate] = useState(currentDate());
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [memoText, setMemoText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refreshMemos() {
    const res = await fetch("/api/gas/memos", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setMemos(json.memos as MemoRecord[]);
  }

  async function handleSubmit() {
    if (!date) {
      toast.warning("日付を入力してください。");
      return;
    }
    if (!memoText.trim()) {
      toast.warning("メモの内容を入力してください。");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { date, memo: memoText.trim() };
      if (account.trim()) body.account = account.trim();
      if (amount !== "") body.amount = Number(amount);

      const res = await fetch("/api/gas/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");

      toast.success("メモを追加しました");
      setAccount("");
      setAmount("");
      setMemoText("");
      await refreshMemos();
    } catch (error) {
      toast.error(`保存に失敗しました: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/gas/memos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "削除に失敗しました");
      toast.success("メモを削除しました");
      await refreshMemos();
    } catch (error) {
      toast.error(`削除に失敗しました: ${String(error)}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">メモを追加</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memo-date">日付</Label>
              <Input id="memo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memo-account">口座・引き落とし先（任意）</Label>
              <Input
                id="memo-account"
                type="text"
                placeholder="例: りそな銀行（雅一）"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memo-amount">金額（任意）</Label>
              <Input
                id="memo-amount"
                type="number"
                inputMode="numeric"
                placeholder="金額（円）"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memo-text">内容</Label>
            <Textarea
              id="memo-text"
              placeholder="例: 奨学金の引き落とし。毎月27日ごろ。"
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
            />
          </div>
          <Button onClick={handleSubmit} disabled={saving} size="lg">
            {saving ? "保存中..." : "メモを追加"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">メモ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {memos.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだメモがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">日付</th>
                    <th className="py-2 pr-4 font-medium">口座・引き落とし先</th>
                    <th className="py-2 pr-4 text-right font-medium">金額</th>
                    <th className="py-2 pr-4 font-medium">内容</th>
                    <th className="py-2 pl-4 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {memos.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pr-4">{formatDateLabel(m.date)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.account || "—"}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {m.amount !== null ? formatYen(m.amount) : "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-pre-wrap">{m.memo}</td>
                      <td className="py-2 pl-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(m.id)}
                          disabled={deletingId === m.id}
                        >
                          {deletingId === m.id ? "削除中..." : "削除"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
