"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/accounts";
import { formatYen } from "@/lib/format";
import type { Category, MonthlyEntry, Person } from "@/lib/types";

const ASSET_CATEGORIES: Category[] = ["銀行", "証券", "暗号資産"];

interface AssetBreakdownChartProps {
  entries: MonthlyEntry[];
}

interface ChartDatum {
  key: string;
  label: string;
  person: Person;
  category: Category;
  amount: number;
}

interface TooltipPayloadItem {
  payload: ChartDatum;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{item.label}</p>
      <p className="text-muted-foreground">
        {item.person} ・ {CATEGORY_LABELS[item.category]}
      </p>
      <p className="mt-1 font-semibold">{formatYen(item.amount)}</p>
    </div>
  );
}

export function AssetBreakdownChart({ entries }: AssetBreakdownChartProps) {
  const assetEntries = entries.filter((e) => ASSET_CATEGORIES.includes(e.category));
  const nameCounts = new Map<string, number>();
  assetEntries.forEach((e) => {
    nameCounts.set(e.account_name, (nameCounts.get(e.account_name) ?? 0) + 1);
  });

  const data: ChartDatum[] = assetEntries
    .map((e) => ({
      key: `${e.person}|${e.category}|${e.account_name}`,
      label: (nameCounts.get(e.account_name) ?? 0) > 1 ? `${e.account_name}（${e.person}）` : e.account_name,
      person: e.person,
      category: e.category,
      amount: e.amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const presentCategories = ASSET_CATEGORIES.filter((c) => data.some((d) => d.category === c));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">この月の資産データがありません。</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
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
            dataKey="label"
            width={170}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--chart-text-secondary)", fontSize: 12 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((d) => (
              <Cell key={d.key} fill={CATEGORY_COLORS[d.category]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4">
        {presentCategories.map((c) => (
          <div key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[c] }}
            />
            {CATEGORY_LABELS[c]}
          </div>
        ))}
      </div>
    </div>
  );
}
