"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bankAccountLabels } from "@/lib/accounts";
import { formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MemoAmountType, MemoFrequency, MemoRecord, MemoType } from "@/lib/types";

interface MemoViewProps {
  initialMemos: MemoRecord[];
}

interface MemoFormValues {
  account: string;
  type: MemoType;
  frequency: MemoFrequency;
  dayOfMonth: string;
  amountType: MemoAmountType;
  amount: string;
  memoText: string;
}

const BANK_OPTIONS = bankAccountLabels();

function sortMemos(memos: MemoRecord[]): MemoRecord[] {
  return [...memos].sort((a, b) => {
    if (a.frequency !== b.frequency) return a.frequency === "定期" ? -1 : 1;
    if (a.frequency === "定期") return (a.day_of_month ?? 99) - (b.day_of_month ?? 99);
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

function TypeBadge({ type }: { type: MemoType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        type === "入金" ? "bg-success-text/10 text-success-text" : "bg-destructive/10 text-destructive"
      )}
    >
      {type}
    </span>
  );
}

function FrequencyBadge({ frequency, dayOfMonth }: { frequency: MemoFrequency; dayOfMonth: number | null }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {frequency === "定期" ? `定期・毎月${dayOfMonth}日` : "都度"}
    </span>
  );
}

export function MemoView({ initialMemos }: MemoViewProps) {
  const [memos, setMemos] = useState(initialMemos);
  const [account, setAccount] = useState(BANK_OPTIONS[0] ?? "");
  const [type, setType] = useState<MemoType>("出金");
  const [frequency, setFrequency] = useState<MemoFrequency>("定期");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [amountType, setAmountType] = useState<MemoAmountType>("固定");
  const [amount, setAmount] = useState("");
  const [memoText, setMemoText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function refreshMemos() {
    const res = await fetch("/api/gas/memos", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setMemos(json.memos as MemoRecord[]);
  }

  async function handleSubmit() {
    if (!account) {
      toast.warning("口座を選択してください。");
      return;
    }
    if (frequency === "定期" && (dayOfMonth === "" || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31)) {
      toast.warning("定期の場合、日（1〜31）を入力してください。");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { account, type, frequency, amount_type: amountType };
      if (frequency === "定期") body.day_of_month = Number(dayOfMonth);
      if (amountType === "固定" && amount !== "") body.amount = Number(amount);
      if (memoText.trim()) body.memo = memoText.trim();

      const res = await fetch("/api/gas/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");

      toast.success("メモを追加しました");
      setDayOfMonth("");
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

  async function handleUpdate(id: string, values: MemoFormValues) {
    if (!values.account) {
      toast.warning("口座を選択してください。");
      return;
    }
    if (values.frequency === "定期" && (values.dayOfMonth === "" || Number(values.dayOfMonth) < 1 || Number(values.dayOfMonth) > 31)) {
      toast.warning("定期の場合、日（1〜31）を入力してください。");
      return;
    }

    setUpdatingId(id);
    try {
      const body: Record<string, unknown> = {
        id,
        account: values.account,
        type: values.type,
        frequency: values.frequency,
        amount_type: values.amountType,
      };
      if (values.frequency === "定期") body.day_of_month = Number(values.dayOfMonth);
      if (values.amountType === "固定" && values.amount !== "") body.amount = Number(values.amount);
      if (values.memoText.trim()) body.memo = values.memoText.trim();

      const res = await fetch("/api/gas/memos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "更新に失敗しました");

      toast.success("メモを更新しました");
      setEditingId(null);
      await refreshMemos();
    } catch (error) {
      toast.error(`更新に失敗しました: ${String(error)}`);
    } finally {
      setUpdatingId(null);
    }
  }

  const sorted = sortMemos(memos);
  const recurring = sorted.filter((m) => m.frequency === "定期");
  const irregular = sorted.filter((m) => m.frequency === "都度");

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">メモを追加</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memo-account">口座</Label>
              <select
                id="memo-account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {BANK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>種別</Label>
              <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1">
                {(["出金", "入金"] as MemoType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "h-8 flex-1 rounded-md px-4 text-sm font-medium transition-colors",
                      type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>頻度</Label>
              <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1">
                {(["定期", "都度"] as MemoFrequency[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrequency(f)}
                    className={cn(
                      "h-8 flex-1 rounded-md px-4 text-sm font-medium transition-colors",
                      frequency === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {frequency === "定期" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="memo-day">毎月何日</Label>
                <Input
                  id="memo-day"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  placeholder="例: 27"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>金額の種類</Label>
              <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1">
                {(["固定", "変動"] as MemoAmountType[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmountType(a)}
                    className={cn(
                      "h-8 flex-1 rounded-md px-4 text-sm font-medium transition-colors",
                      amountType === a ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {a === "固定" ? "固定額" : "利用料に応じて"}
                  </button>
                ))}
              </div>
            </div>

            {amountType === "固定" && (
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
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memo-text">内容（任意）</Label>
            <Textarea
              id="memo-text"
              placeholder="例: 利用料に応じて請求"
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
        <CardContent className="space-y-6">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだメモがありません。</p>
          ) : (
            <>
              {recurring.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">定期</h3>
                  <div className="space-y-3">
                    {recurring.map((m) => (
                      <MemoCard
                        key={m.id}
                        memo={m}
                        deleting={deletingId === m.id}
                        editing={editingId === m.id}
                        updating={updatingId === m.id}
                        onDelete={handleDelete}
                        onStartEdit={() => setEditingId(m.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onSave={(values) => handleUpdate(m.id, values)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {irregular.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">都度</h3>
                  <div className="space-y-3">
                    {irregular.map((m) => (
                      <MemoCard
                        key={m.id}
                        memo={m}
                        deleting={deletingId === m.id}
                        editing={editingId === m.id}
                        updating={updatingId === m.id}
                        onDelete={handleDelete}
                        onStartEdit={() => setEditingId(m.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onSave={(values) => handleUpdate(m.id, values)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function memoToFormValues(memo: MemoRecord): MemoFormValues {
  return {
    account: memo.account,
    type: memo.type,
    frequency: memo.frequency,
    dayOfMonth: memo.day_of_month !== null ? String(memo.day_of_month) : "",
    amountType: memo.amount_type,
    amount: memo.amount !== null ? String(memo.amount) : "",
    memoText: memo.memo ?? "",
  };
}

function MemoCard({
  memo,
  deleting,
  editing,
  updating,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  memo: MemoRecord;
  deleting: boolean;
  editing: boolean;
  updating: boolean;
  onDelete: (id: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: MemoFormValues) => void;
}) {
  const [values, setValues] = useState<MemoFormValues>(() => memoToFormValues(memo));

  function startEdit() {
    setValues(memoToFormValues(memo));
    onStartEdit();
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-account-${memo.id}`}>口座</Label>
            <select
              id={`edit-account-${memo.id}`}
              value={values.account}
              onChange={(e) => setValues((v) => ({ ...v, account: e.target.value }))}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {BANK_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>種別</Label>
            <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1">
              {(["出金", "入金"] as MemoType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, type: t }))}
                  className={cn(
                    "h-8 flex-1 rounded-md px-4 text-sm font-medium transition-colors",
                    values.type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>頻度</Label>
            <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1">
              {(["定期", "都度"] as MemoFrequency[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, frequency: f }))}
                  className={cn(
                    "h-8 flex-1 rounded-md px-4 text-sm font-medium transition-colors",
                    values.frequency === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {values.frequency === "定期" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-day-${memo.id}`}>毎月何日</Label>
              <Input
                id={`edit-day-${memo.id}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                placeholder="例: 27"
                value={values.dayOfMonth}
                onChange={(e) => setValues((v) => ({ ...v, dayOfMonth: e.target.value }))}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>金額の種類</Label>
            <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1">
              {(["固定", "変動"] as MemoAmountType[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, amountType: a }))}
                  className={cn(
                    "h-8 flex-1 rounded-md px-4 text-sm font-medium transition-colors",
                    values.amountType === a ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {a === "固定" ? "固定額" : "利用料に応じて"}
                </button>
              ))}
            </div>
          </div>

          {values.amountType === "固定" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-amount-${memo.id}`}>金額（任意）</Label>
              <Input
                id={`edit-amount-${memo.id}`}
                type="number"
                inputMode="numeric"
                placeholder="金額（円）"
                value={values.amount}
                onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor={`edit-memo-${memo.id}`}>内容（任意）</Label>
          <Textarea
            id={`edit-memo-${memo.id}`}
            placeholder="例: 利用料に応じて請求"
            value={values.memoText}
            onChange={(e) => setValues((v) => ({ ...v, memoText: e.target.value }))}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => onSave(values)} disabled={updating}>
            {updating ? "保存中..." : "保存"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancelEdit} disabled={updating}>
            キャンセル
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="truncate font-medium">{memo.account}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <TypeBadge type={memo.type} />
        <FrequencyBadge frequency={memo.frequency} dayOfMonth={memo.day_of_month} />
      </div>
      {memo.amount_type === "変動" ? (
        <p className="mt-2 text-sm font-medium text-muted-foreground">利用料に応じて</p>
      ) : (
        memo.amount !== null && <p className="mt-2 font-semibold tabular-nums">{formatYen(memo.amount)}</p>
      )}
      {memo.memo && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{memo.memo}</p>}
      <div className="mt-2 flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={startEdit}>
          編集
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(memo.id)} disabled={deleting}>
          {deleting ? "削除中..." : "削除"}
        </Button>
      </div>
    </div>
  );
}
