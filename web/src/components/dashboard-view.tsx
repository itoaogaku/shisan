import Link from "next/link";

import { AccountDetailTable } from "@/components/account-detail-table";
import { AssetBreakdownChart } from "@/components/asset-breakdown-chart";
import { CardBreakdownChart } from "@/components/card-breakdown-chart";
import { StatCard } from "@/components/stat-card";
import { TrendChart } from "@/components/trend-chart";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YearMonthSelect } from "@/components/year-month-select";
import { formatYearMonthLabel, formatYen } from "@/lib/format";
import type { MonthlyEntry, TrendPoint } from "@/lib/types";

interface DashboardViewProps {
  yearMonthOptions: string[];
  selectedYearMonth: string;
  entries: MonthlyEntry[];
  previousEntries: MonthlyEntry[];
  previousYearMonth: string;
  trend: TrendPoint[];
}

export function DashboardView({
  yearMonthOptions,
  selectedYearMonth,
  entries,
  previousEntries,
  previousYearMonth,
  trend,
}: DashboardViewProps) {
  const isAsset = (e: MonthlyEntry) => e.category !== "カード";
  const totalAssets = entries.filter(isAsset).reduce((s, e) => s + e.amount, 0);
  const masakazuTotal = entries
    .filter((e) => isAsset(e) && e.person === "雅一")
    .reduce((s, e) => s + e.amount, 0);
  const honokaTotal = entries
    .filter((e) => isAsset(e) && e.person === "穂夏")
    .reduce((s, e) => s + e.amount, 0);
  const cardTotal = entries.filter((e) => e.category === "カード").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground">{formatYearMonthLabel(selectedYearMonth)} 時点</p>
        </div>
        <div className="flex items-center gap-2">
          <YearMonthSelect value={selectedYearMonth} options={yearMonthOptions} />
          <Link
            href={`/input?ym=${encodeURIComponent(selectedYearMonth)}`}
            className={buttonVariants({ variant: "outline" })}
          >
            この月のデータを編集
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="世帯全体の総資産額" value={totalAssets} emphasis className="lg:col-span-2" />
        <StatCard label="雅一 合計" value={masakazuTotal} />
        <StatCard label="穂夏 合計" value={honokaTotal} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">資産内訳（口座別）</CardTitle>
          </CardHeader>
          <CardContent>
            <AssetBreakdownChart entries={entries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">カード当月合計</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-3xl font-semibold">{formatYen(cardTotal)}</p>
            <CardBreakdownChart entries={entries} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">総資産推移</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart trend={trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-foreground">口座別 明細</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountDetailTable
            entries={entries}
            previousEntries={previousEntries}
            previousYearMonth={previousYearMonth}
          />
        </CardContent>
      </Card>
    </div>
  );
}
