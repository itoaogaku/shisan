"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CATEGORY_COLORS } from "@/lib/accounts";
import { formatYen } from "@/lib/format";
import type { MonthlyEntry } from "@/lib/types";

interface CardBreakdownChartProps {
  entries: MonthlyEntry[];
}

interface TooltipPayloadItem {
  payload: { account_name: string; amount: number };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{item.account_name}</p>
      <p className="mt-1 font-semibold">{formatYen(item.amount)}</p>
    </div>
  );
}

export function CardBreakdownChart({ entries }: CardBreakdownChartProps) {
  const data = entries
    .filter((e) => e.category === "カード")
    .map((e) => ({ account_name: e.account_name, amount: e.amount }))
    .sort((a, b) => b.amount - a.amount);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">この月のカードデータがありません。</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatYen(v)}
          stroke="var(--chart-axis)"
          tick={{ fill: "var(--chart-text-muted)", fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="account_name"
          width={140}
          stroke="var(--chart-axis)"
          tick={{ fill: "var(--chart-text-secondary)", fontSize: 12 }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={24} fill={CATEGORY_COLORS.カード} />
      </BarChart>
    </ResponsiveContainer>
  );
}
