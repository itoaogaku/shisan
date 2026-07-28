export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  if (!y || !m) return yearMonth;
  return `${y}年${Number(m)}月`;
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const date = new Date(y, m - 1 + deltaMonths, 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

/**
 * カードの締め日から、対象年月に入力する金額が実際にどの利用期間分かを求める。
 * 例: yearMonth="2026-07", closingDay=15 → "5月16日〜6月15日"
 *     yearMonth="2026-07", closingDay=25 → "5月26日〜6月25日"
 * （締め日の翌日〜翌月の締め日までが、対象月の1〜5日ごろに記入する請求額の対象期間）
 */
export function formatCardBillingPeriod(yearMonth: string, closingDay: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const startDate = new Date(y, m - 3, closingDay + 1);
  const endDate = new Date(y, m - 2, closingDay);
  const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${fmt(startDate)}〜${fmt(endDate)}`;
}
