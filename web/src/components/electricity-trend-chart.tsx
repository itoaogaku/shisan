"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatYearMonthLabel, formatYen } from "@/lib/format";
import type { ElectricityTrendPoint } from "@/lib/types";

interface ElectricityTrendChartProps {
  trend: ElectricityTrendPoint[];
}

const SERIES = [
  { key: "income", label: "売電収入", color: "var(--chart-1)" },
  { key: "expense", label: "買電支出", color: "var(--chart-2)" },
  { key: "net", label: "収支", color: "var(--chart-3)" },
] as const;

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

export function ElectricityTrendChart({ trend }: ElectricityTrendChartProps) {
  if (trend.length === 0) {
    return <p className="text-sm text-muted-foreground">推移データがまだありません。</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
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
              strokeWidth={2}
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
