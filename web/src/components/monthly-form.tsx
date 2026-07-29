"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACCOUNTS, CATEGORY_LABELS, PERSON_LABELS, accountsFor, categoriesFor, entryKey } from "@/lib/accounts";
import { formatCardBillingInfo, formatYearMonthLabel } from "@/lib/format";
import type { MonthlyEntry, Person } from "@/lib/types";

const PERSON_TABS: Person[] = ["雅一", "穂夏", "共通"];

type FormValues = Record<string, string>;

function buildValues(entries: MonthlyEntry[]): FormValues {
  const values: FormValues = {};
  entries.forEach((e) => {
    values[entryKey(e.person, e.category, e.account_name)] = String(e.amount);
  });
  return values;
}

interface MonthlyFormProps {
  initialYearMonth: string;
  initialEntries: MonthlyEntry[];
}

export function MonthlyForm({ initialYearMonth, initialEntries }: MonthlyFormProps) {
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const [values, setValues] = useState<FormValues>(() => buildValues(initialEntries));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleYearMonthChange(nextYearMonth: string) {
    setYearMonth(nextYearMonth);
    if (!nextYearMonth) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gas/monthly?year_month=${encodeURIComponent(nextYearMonth)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "読み込みに失敗しました");
      setValues(buildValues(json.data as MonthlyEntry[]));
    } catch (error) {
      toast.error(`${nextYearMonth} のデータ読み込みに失敗しました: ${String(error)}`);
      setValues({});
    } finally {
      setLoading(false);
    }
  }

  function handleChange(key: string, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw }));
  }

  async function handleSubmit() {
    const entries = ACCOUNTS.map((a) => {
      const key = entryKey(a.person, a.category, a.account_name);
      const raw = values[key];
      if (raw === undefined || raw === "") return null;
      const amount = Number(raw);
      if (Number.isNaN(amount)) return null;
      return { person: a.person, category: a.category, account_name: a.account_name, amount };
    }).filter((e): e is NonNullable<typeof e> => e !== null);

    if (entries.length === 0) {
      toast.warning("入力された金額がありません。");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/gas/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year_month: yearMonth, entries }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");
      toast.success(`${formatYearMonthLabel(yearMonth)} のデータを保存しました（${json.saved}件）`);
    } catch (error) {
      toast.error(`保存に失敗しました: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="year-month">対象年月</Label>
          <Input
            id="year-month"
            type="month"
            value={yearMonth}
            onChange={(e) => handleYearMonthChange(e.target.value)}
            className="w-44"
          />
        </div>
        {loading && <p className="text-sm text-muted-foreground">読み込み中...</p>}
      </div>

      <Tabs defaultValue="雅一">
        <TabsList>
          {PERSON_TABS.map((p) => (
            <TabsTrigger key={p} value={p}>
              {PERSON_LABELS[p]}
            </TabsTrigger>
          ))}
        </TabsList>

        {PERSON_TABS.map((person) => (
          <TabsContent key={person} value={person} className="space-y-4">
            {categoriesFor(person).map((category) => (
              <Card key={category}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-foreground">{CATEGORY_LABELS[category]}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {accountsFor(person)
                    .filter((a) => a.category === category)
                    .map((a) => {
                      const key = entryKey(a.person, a.category, a.account_name);
                      const billingInfo =
                        a.closingDay !== undefined && a.withdrawalDay !== undefined
                          ? formatCardBillingInfo(yearMonth, a.closingDay, a.withdrawalDay)
                          : null;
                      return (
                        <div key={key} className="flex flex-col gap-1.5">
                          <div>
                            <Label htmlFor={key}>{a.account_name}</Label>
                            {billingInfo && (
                              <p className="text-xs text-muted-foreground">対象期間: {billingInfo}</p>
                            )}
                          </div>
                          <Input
                            id={key}
                            type="number"
                            inputMode="numeric"
                            placeholder="金額（円）"
                            value={values[key] ?? ""}
                            onChange={(e) => handleChange(key, e.target.value)}
                          />
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <Button onClick={handleSubmit} disabled={saving || loading} size="lg">
        {saving ? "保存中..." : `${formatYearMonthLabel(yearMonth)} のデータを保存`}
      </Button>
    </div>
  );
}
