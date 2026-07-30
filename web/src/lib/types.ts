export type Person = "雅一" | "穂夏" | "共通";
export type Category = "銀行" | "証券" | "暗号資産" | "カード";

export interface AccountDef {
  person: Person;
  category: Category;
  account_name: string;
  /** カードの締め日（例: 15 なら毎月15日締め）。カテゴリ「カード」の口座のみ使用。 */
  closingDay?: number;
  /** カードの引き落とし日（例: 10 なら毎月10日ごろ引き落とし）。カテゴリ「カード」の口座のみ使用。 */
  withdrawalDay?: number;
}

export interface MonthlyEntry {
  year_month: string;
  person: Person;
  category: Category;
  account_name: string;
  amount: number;
  updated_at?: string;
}

export interface PersonTotals {
  雅一: number;
  穂夏: number;
}

export interface TrendPoint {
  year_month: string;
  total_assets: number;
  person_totals: PersonTotals;
  card_total: number;
}

export interface ElectricityRecord {
  year_month: string;
  income: number | null;
  expense: number | null;
  income_kwh: number | null;
  expense_kwh: number | null;
  updated_at?: string;
}

export interface ElectricityTrendPoint {
  year_month: string;
  income: number | null;
  expense: number | null;
  net: number | null;
  income_kwh: number | null;
  expense_kwh: number | null;
  net_kwh: number | null;
}

export type MemoType = "入金" | "出金";
export type MemoFrequency = "定期" | "都度";
export type MemoAmountType = "固定" | "変動";

export interface MemoRecord {
  id: string;
  account: string;
  type: MemoType;
  frequency: MemoFrequency;
  /** frequency が「定期」の場合のみ 1〜31。「都度」の場合は null。 */
  day_of_month: number | null;
  /** 「固定」なら金額を指定できる。「変動」（利用料に応じて等）なら amount は常に null。 */
  amount_type: MemoAmountType;
  amount: number | null;
  memo: string;
  created_at?: string;
}

