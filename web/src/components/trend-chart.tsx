"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatYearMonthLabel, formatYen } from "@/lib/format";
import type { TrendPoint } from "@/lib/types";

interface TrendChartProps {
  trend: TrendPoint[];
}

const SERIES = [
  { key: "total_assets", label: "世帯総資産", color: "var(--chart-1)" },
  { key: "person_totals.雅一", label: "雅一", color: "var(--chart-2)" },
  { key: "person_totals.穂夏", label: "穂夏", color: "var(--chart-3)" },
] as const;

interface ChartRow {
  year_month: string;
  total_assets: number;
  雅一: number;
  穂夏: number;
}

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
          const series = SERIES.find((s) => s.key.replace("person_totals.", "") === p.dataKey);
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

  const data: ChartRow[] = trend.map((t) => ({
    year_month: t.year_month,
    total_assets: t.total_assets,
    雅一: t.person_totals["雅一"] ?? 0,
    穂夏: t.person_totals["穂夏"] ?? 0,
  }));

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
          <Line
            type="monotone"
            dataKey="total_assets"
            name="世帯総資産"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="雅一"
            name="雅一"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--chart-2)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="穂夏"
            name="穂夏"
            stroke="var(--chart-3)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--chart-3)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
          />
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
