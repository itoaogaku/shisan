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
  income: number;
  expense: number;
  updated_at?: string;
}

export interface ElectricityTrendPoint {
  year_month: string;
  income: number;
  expense: number;
  net: number;
}

export interface MemoRecord {
  id: string;
  date: string;
  account: string;
  amount: number | null;
  memo: string;
  created_at?: string;
}

