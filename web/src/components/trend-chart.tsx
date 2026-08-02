"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/accounts";
import { formatYearMonthLabel, formatYen } from "@/lib/format";
import type { Category, TrendPoint } from "@/lib/types";

interface TrendChartProps {
  trend: TrendPoint[];
}

const CATEGORIES: Category[] = ["銀行", "証券", "暗号資産", "カード"];

const SERIES = [
  { key: "net_worth", label: "推定資産", color: "var(--chart-5)" },
  { key: "total_assets", label: "世帯総資産", color: "var(--chart-text-primary)" },
  ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c], color: CATEGORY_COLORS[c] })),
] as const;

type ChartRow = {
  year_month: string;
  total_assets: number;
  net_worth: number;
} & Record<Category, number>;

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{formatYearMonthLabel(label ?? "")}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((p) => {
          const series = SERIES.find((s) => s.key === p.dataKey);
          return (
            <div key={p.dataKey} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-muted-foreground">{series?.label ?? p.dataKey}</span>
              <span className="ml-auto font-medium">{formatYen(p.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrendChart({ trend }: TrendChartProps) {
  if (trend.length === 0) {
    return <p className="text-sm text-muted-foreground">推移データがまだありません。</p>;
  }

  const data: ChartRow[] = trend.map((t) => {
    const cardTotal = t.category_totals?.カード ?? t.card_total ?? 0;
    return {
      year_month: t.year_month,
      total_assets: t.total_assets,
      net_worth: t.total_assets - cardTotal,
      銀行: t.category_totals?.銀行 ?? 0,
      証券: t.category_totals?.証券 ?? 0,
      暗号資産: t.category_totals?.暗号資産 ?? 0,
      カード: cardTotal,
    };
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="year_month"
            tickFormatter={formatYearMonthLabel}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--chart-text-muted)", fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatYen(v)}
            stroke="var(--chart-axis)"
            tick={{ fill: "var(--chart-text-muted)", fontSize: 12 }}
            width={90}
          />
          <Tooltip content={<ChartTooltip />} />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.key === "net_worth" ? 3 : s.key === "total_assets" ? 2.5 : 2}
              strokeDasharray={s.key === "total_assets" ? "5 3" : undefined}
              dot={{ r: 4, fill: s.color, stroke: "var(--chart-surface)", strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-4">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
