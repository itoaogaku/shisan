"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ElectricityHistoryTable } from "@/components/electricity-history-table";
import { ElectricityTrendChart } from "@/components/electricity-trend-chart";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKwh, formatYearMonthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ElectricityRecord, ElectricityTrendPoint } from "@/lib/types";

interface ElectricityViewProps {
  initialYearMonth: string;
  initialData: ElectricityRecord | null;
  trend: ElectricityTrendPoint[];
}

export function ElectricityView({ initialYearMonth, initialData, trend: initialTrend }: ElectricityViewProps) {
  const [yearMonth, setYearMonth] = useState(initialYearMonth);
  const [income, setIncome] = useState(initialData ? String(initialData.income) : "");
  const [expense, setExpense] = useState(initialData ? String(initialData.expense) : "");
  const [incomeKwh, setIncomeKwh] = useState(
    initialData?.income_kwh !== null && initialData?.income_kwh !== undefined ? String(initialData.income_kwh) : ""
  );
  const [expenseKwh, setExpenseKwh] = useState(
    initialData?.expense_kwh !== null && initialData?.expense_kwh !== undefined
      ? String(initialData.expense_kwh)
      : ""
  );
  const [trend, setTrend] = useState(initialTrend);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleYearMonthChange(nextYearMonth: string) {
    setYearMonth(nextYearMonth);
    if (!nextYearMonth) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/gas/electricity?year_month=${encodeURIComponent(nextYearMonth)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "読み込みに失敗しました");
      const data = json.data as ElectricityRecord | null;
      setIncome(data ? String(data.income) : "");
      setExpense(data ? String(data.expense) : "");
      setIncomeKwh(data?.income_kwh !== null && data?.income_kwh !== undefined ? String(data.income_kwh) : "");
      setExpenseKwh(data?.expense_kwh !== null && data?.expense_kwh !== undefined ? String(data.expense_kwh) : "");
    } catch (error) {
      toast.error(`${nextYearMonth} のデータ読み込みに失敗しました: ${String(error)}`);
      setIncome("");
      setExpense("");
      setIncomeKwh("");
      setExpenseKwh("");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (income === "" && expense === "" && incomeKwh === "" && expenseKwh === "") {
      toast.warning("入力された値がありません。");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { year_month: yearMonth };
      if (income !== "") body.income = Number(income);
      if (expense !== "") body.expense = Number(expense);
      if (incomeKwh !== "") body.income_kwh = Number(incomeKwh);
      if (expenseKwh !== "") body.expense_kwh = Number(expenseKwh);

      const res = await fetch("/api/gas/electricity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");
      toast.success(`${formatYearMonthLabel(yearMonth)} の電気代データを保存しました`);

      const trendRes = await fetch("/api/gas/electricity/trend", { cache: "no-store" });
      const trendJson = await trendRes.json();
      if (trendJson.ok) setTrend(trendJson.trend as ElectricityTrendPoint[]);
    } catch (error) {
      toast.error(`保存に失敗しました: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const incomeNum = Number(income) || 0;
  const expenseNum = Number(expense) || 0;
  const net = incomeNum - expenseNum;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="売電収入" value={incomeNum} hint={incomeKwh !== "" ? formatKwh(Number(incomeKwh)) : undefined} />
        <StatCard
          label="買電支出"
          value={expenseNum}
          hint={expenseKwh !== "" ? formatKwh(Number(expenseKwh)) : undefined}
        />
        <StatCard
          label="収支（売電収入 − 買電支出）"
          value={net}
          emphasis
          valueClassName={cn(net > 0 && "text-success-text", net < 0 && "text-destructive")}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">月次入力</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="electricity-year-month">対象年月</Label>
            <Input
              id="electricity-year-month"
              type="month"
              value={yearMonth}
              onChange={(e) => handleYearMonthChange(e.target.value)}
              className="w-44"
            />
            {loading && <p className="text-sm text-muted-foreground">読み込み中...</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="income">売電収入</Label>
              <Input
                id="income"
                type="number"
                inputMode="numeric"
                placeholder="金額（円）"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="income-kwh">売電量（任意）</Label>
              <Input
                id="income-kwh"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="電力量（kWh）"
                value={incomeKwh}
                onChange={(e) => setIncomeKwh(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense">買電支出</Label>
              <Input
                id="expense"
                type="number"
                inputMode="numeric"
                placeholder="金額（円）"
                value={expense}
                onChange={(e) => setExpense(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-kwh">買電量（任意）</Label>
              <Input
                id="expense-kwh"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="電力量（kWh）"
                value={expenseKwh}
                onChange={(e) => setExpenseKwh(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={saving || loading} size="lg">
            {saving ? "保存中..." : `${formatYearMonthLabel(yearMonth)} のデータを保存`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">売電・買電の推移</CardTitle>
        </CardHeader>
        <CardContent>
          <ElectricityTrendChart trend={trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">月別履歴</CardTitle>
        </CardHeader>
        <CardContent>
          <ElectricityHistoryTable trend={trend} />
        </CardContent>
      </Card>
    </div>
  );
}
