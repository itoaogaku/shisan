"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatYen } from "@/lib/format";
import type { AnnualMemoRecord } from "@/lib/types";

interface AnnualMemoViewProps {
  initialAnnualMemos: AnnualMemoRecord[];
}

interface AnnualMemoFormValues {
  itemName: string;
  paymentDate: string;
  amount: string;
  note: string;
}

function sortAnnualMemos(memos: AnnualMemoRecord[]): AnnualMemoRecord[] {
  return [...memos].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

function annualMemoToFormValues(memo: AnnualMemoRecord): AnnualMemoFormValues {
  return {
    itemName: memo.item_name,
    paymentDate: memo.payment_date,
    amount: memo.amount !== null ? String(memo.amount) : "",
    note: memo.note ?? "",
  };
}

export function AnnualMemoView({ initialAnnualMemos }: AnnualMemoViewProps) {
  const [memos, setMemos] = useState(initialAnnualMemos);
  const [itemName, setItemName] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function refreshMemos() {
    const res = await fetch("/api/gas/annual-memos", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setMemos(json.annual_memos as AnnualMemoRecord[]);
  }

  async function handleSubmit() {
    if (!itemName.trim()) {
      toast.warning("項目名を入力してください。");
      return;
    }
    if (!paymentDate.trim()) {
      toast.warning("支払い日を入力してください。");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { item_name: itemName.trim(), payment_date: paymentDate.trim() };
      if (amount !== "") body.amount = Number(amount);
      if (note.trim()) body.note = note.trim();

      const res = await fetch("/api/gas/annual-memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");

      toast.success("年間メモを追加しました");
      setItemName("");
      setPaymentDate("");
      setAmount("");
      setNote("");
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
      const res = await fetch(`/api/gas/annual-memos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "削除に失敗しました");
      toast.success("年間メモを削除しました");
      await refreshMemos();
    } catch (error) {
      toast.error(`削除に失敗しました: ${String(error)}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpdate(id: string, values: AnnualMemoFormValues) {
    if (!values.itemName.trim()) {
      toast.warning("項目名を入力してください。");
      return;
    }
    if (!values.paymentDate.trim()) {
      toast.warning("支払い日を入力してください。");
      return;
    }

    setUpdatingId(id);
    try {
      const body: Record<string, unknown> = {
        id,
        item_name: values.itemName.trim(),
        payment_date: values.paymentDate.trim(),
      };
      if (values.amount !== "") body.amount = Number(values.amount);
      if (values.note.trim()) body.note = values.note.trim();

      const res = await fetch("/api/gas/annual-memos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "更新に失敗しました");

      toast.success("年間メモを更新しました");
      setEditingId(null);
      await refreshMemos();
    } catch (error) {
      toast.error(`更新に失敗しました: ${String(error)}`);
    } finally {
      setUpdatingId(null);
    }
  }

  const sorted = sortAnnualMemos(memos);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">年間の支払いメモを追加</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="annual-item-name">項目名</Label>
              <Input
                id="annual-item-name"
                placeholder="例: 自動車税"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="annual-payment-date">支払い日</Label>
              <Input
                id="annual-payment-date"
                placeholder="例: 5月31日ごろ"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="annual-amount">金額（任意）</Label>
              <Input
                id="annual-amount"
                type="number"
                inputMode="numeric"
                placeholder="金額（円）"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="annual-note">備考（任意）</Label>
            <Textarea
              id="annual-note"
              placeholder="例: 普通車・軽自動車の2台分"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} disabled={saving} size="lg">
            {saving ? "保存中..." : "年間メモを追加"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">年間の支払い一覧</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだ年間メモがありません。</p>
          ) : (
            sorted.map((m) => (
              <AnnualMemoCard
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
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AnnualMemoCard({
  memo,
  deleting,
  editing,
  updating,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  memo: AnnualMemoRecord;
  deleting: boolean;
  editing: boolean;
  updating: boolean;
  onDelete: (id: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (values: AnnualMemoFormValues) => void;
}) {
  const [values, setValues] = useState<AnnualMemoFormValues>(() => annualMemoToFormValues(memo));

  function startEdit() {
    setValues(annualMemoToFormValues(memo));
    onStartEdit();
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-annual-item-name-${memo.id}`}>項目名</Label>
            <Input
              id={`edit-annual-item-name-${memo.id}`}
              placeholder="例: 自動車税"
              value={values.itemName}
              onChange={(e) => setValues((v) => ({ ...v, itemName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-annual-payment-date-${memo.id}`}>支払い日</Label>
            <Input
              id={`edit-annual-payment-date-${memo.id}`}
              placeholder="例: 5月31日ごろ"
              value={values.paymentDate}
              onChange={(e) => setValues((v) => ({ ...v, paymentDate: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-annual-amount-${memo.id}`}>金額（任意）</Label>
            <Input
              id={`edit-annual-amount-${memo.id}`}
              type="number"
              inputMode="numeric"
              placeholder="金額（円）"
              value={values.amount}
              onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor={`edit-annual-note-${memo.id}`}>備考（任意）</Label>
          <Textarea
            id={`edit-annual-note-${memo.id}`}
            placeholder="例: 普通車・軽自動車の2台分"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
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
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-medium">{memo.item_name}</p>
          <p className="text-sm text-muted-foreground">{memo.payment_date}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={startEdit}>
            編集
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(memo.id)} disabled={deleting}>
            {deleting ? "削除中..." : "削除"}
          </Button>
        </div>
      </div>
      {memo.amount !== null && <p className="mt-2 font-semibold tabular-nums">{formatYen(memo.amount)}</p>}
      {memo.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{memo.note}</p>}
    </div>
  );
}
