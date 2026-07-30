import type { AccountDef, Category, Person } from "./types";

// GAS 側 (gas/Code.gs の ACCOUNTS) と内容を一致させること。
export const ACCOUNTS: AccountDef[] = [
  // 雅一 名義 - 銀行・証券・暗号資産
  { person: "雅一", category: "銀行", account_name: "GMOあおぞらネット銀行" },
  { person: "雅一", category: "銀行", account_name: "りそな銀行" },
  { person: "雅一", category: "銀行", account_name: "三菱UFJ銀行" },
  { person: "雅一", category: "銀行", account_name: "住信SBIネット銀行" },
  { person: "雅一", category: "証券", account_name: "楽天証券" },
  { person: "雅一", category: "暗号資産", account_name: "GMOコイン" },
  { person: "雅一", category: "暗号資産", account_name: "Bybit" },

  // 穂夏 名義 - 銀行・信用金庫・証券
  { person: "穂夏", category: "銀行", account_name: "りそな銀行" },
  { person: "穂夏", category: "銀行", account_name: "多摩信用金庫" },
  { person: "穂夏", category: "銀行", account_name: "住信SBIネット銀行" },
  { person: "穂夏", category: "銀行", account_name: "埼玉りそな銀行" },
  { person: "穂夏", category: "証券", account_name: "SBI証券" },

  // クレジットカード（世帯共通・月次支払額）
  // closingDay: 締め日。例えば closingDay=15 の場合、対象月に入力する金額は
  // 「2か月前の16日 〜 1か月前の15日」の利用分になる（formatCardBillingPeriod 参照）。
  // withdrawalDay: 引き落とし日。対象月の withdrawalDay 日ごろに、上記の利用分が
  // 口座から引き落とされる（formatCardWithdrawalDate 参照）。
  { person: "共通", category: "カード", account_name: "JCBカード", closingDay: 15, withdrawalDay: 10 },
  { person: "共通", category: "カード", account_name: "三菱UFJカード", closingDay: 15, withdrawalDay: 10 },
  { person: "共通", category: "カード", account_name: "楽天カード", closingDay: 25, withdrawalDay: 25 },
];

export const PEOPLE: Person[] = ["雅一", "穂夏", "共通"];

export const PERSON_LABELS: Record<Person, string> = {
  雅一: "雅一",
  穂夏: "穂夏",
  共通: "カード（共通）",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  銀行: "銀行",
  証券: "証券",
  暗号資産: "暗号資産",
  カード: "クレジットカード",
};

// カテゴリの識別色（固定順・アプリ全体で使い回す。カテゴリごとに色を変えないこと）
export const CATEGORY_COLORS: Record<Category, string> = {
  銀行: "var(--chart-1)",
  証券: "var(--chart-2)",
  暗号資産: "var(--chart-3)",
  カード: "var(--chart-4)",
};

export function accountsFor(person: Person): AccountDef[] {
  return ACCOUNTS.filter((a) => a.person === person);
}

export function categoriesFor(person: Person): Category[] {
  const set = new Set<Category>();
  accountsFor(person).forEach((a) => set.add(a.category));
  return Array.from(set);
}

export function entryKey(person: Person, category: Category, accountName: string): string {
  return [person, category, accountName].join("|");
}

/**
 * 銀行口座の選択肢（プルダウン用）。同名の銀行が複数人にある場合は
 * 「りそな銀行（雅一）」のように名義を付けて区別する。
 */
export function bankAccountLabels(): string[] {
  const banks = ACCOUNTS.filter((a) => a.category === "銀行");
  const nameCounts = new Map<string, number>();
  banks.forEach((a) => nameCounts.set(a.account_name, (nameCounts.get(a.account_name) ?? 0) + 1));
  return banks.map((a) =>
    (nameCounts.get(a.account_name) ?? 0) > 1 ? `${a.account_name}（${a.person}）` : a.account_name
  );
}
