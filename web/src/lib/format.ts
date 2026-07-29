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

/**
 * 対象年月そのものの withdrawalDay 日に引き落とされる、という表示用の日付文字列を返す。
 * 例: yearMonth="2026-07", withdrawalDay=10 → "7月10日"
 */
export function formatCardWithdrawalDate(yearMonth: string, withdrawalDay: number): string {
  const [, m] = yearMonth.split("-");
  return `${Number(m)}月${withdrawalDay}日`;
}

/**
 * 対象期間と引き落とし日をまとめた表示用テキストを返す。
 * 例: "5月16日〜6月15日利用分（7月10日ごろ引き落とし）"
 */
export function formatCardBillingInfo(yearMonth: string, closingDay: number, withdrawalDay: number): string {
  const period = formatCardBillingPeriod(yearMonth, closingDay);
  const withdrawal = formatCardWithdrawalDate(yearMonth, withdrawalDay);
  return `${period}利用分（${withdrawal}ごろ引き落とし）`;
}

export function currentDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export function formatKwh(value: number): string {
  return `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value)}kWh`;
}

/**
 * 売電・買電の対象年月に対する検針・利用期間を求める。
 * 例: yearMonth="2026-05" → "5月2日〜6月1日"
 * （対象月の2日〜翌月1日が検針期間、という基本ルールに基づく）
 */
export function formatElectricityUsagePeriod(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const startDate = new Date(y, m - 1, 2);
  const endDate = new Date(y, m, 1);
  const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${fmt(startDate)}〜${fmt(endDate)}`;
}

/**
 * 対象年月の monthOffset ヶ月後の day 日、という表示用の日付文字列を返す。
 */
function formatElectricitySettlementDate(yearMonth: string, monthOffset: number, day: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const date = new Date(y, m - 1 + monthOffset, day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 買電支出の対象期間・請求日をまとめた表示用テキストを返す。
 * 基本ルール: 対象月の2日〜翌月1日利用分が、2か月後の13日ごろ請求される。
 * 例: yearMonth="2026-05" → "5月2日〜6月1日利用分（7月13日ごろ請求）"
 */
export function formatElectricityExpenseInfo(yearMonth: string): string {
  const period = formatElectricityUsagePeriod(yearMonth);
  const billingDate = formatElectricitySettlementDate(yearMonth, 2, 13);
  return `${period}利用分（${billingDate}ごろ請求）`;
}

/**
 * 売電収入の対象期間・入金日をまとめた表示用テキストを返す。
 * 基本ルール: 対象月の2日〜翌月1日売電分が、翌月28日ごろ入金される。
 * 例: yearMonth="2026-05" → "5月2日〜6月1日売電分（6月28日ごろ入金）"
 */
export function formatElectricityIncomeInfo(yearMonth: string): string {
  const period = formatElectricityUsagePeriod(yearMonth);
  const paymentDate = formatElectricitySettlementDate(yearMonth, 1, 28);
  return `${period}売電分（${paymentDate}ごろ入金）`;
}

/**
 * 対象期間・買電請求日・売電入金日を1行にまとめたコンパクトな表示用テキストを返す。
 * 例: yearMonth="2026-05" → "5月2日〜6月1日分（買電: 7月13日ごろ請求 / 売電: 6月28日ごろ入金）"
 */
export function formatElectricitySettlementSummary(yearMonth: string): string {
  const period = formatElectricityUsagePeriod(yearMonth);
  const expenseDate = formatElectricitySettlementDate(yearMonth, 2, 13);
  const incomeDate = formatElectricitySettlementDate(yearMonth, 1, 28);
  return `${period}分（買電: ${expenseDate}ごろ請求 / 売電: ${incomeDate}ごろ入金）`;
}
