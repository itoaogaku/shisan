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

  // 穂夏 名義 - 銀行・信用金庫
  { person: "穂夏", category: "銀行", account_name: "りそな銀行" },
  { person: "穂夏", category: "銀行", account_name: "多摩信用金庫" },
  { person: "穂夏", category: "銀行", account_name: "住信SBIネット銀行" },
  { person: "穂夏", category: "銀行", account_name: "埼玉りそな銀行" },

  // クレジットカード（世帯共通・月次支払額）
  { person: "共通", category: "カード", account_name: "JCBカード" },
  { person: "共通", category: "カード", account_name: "三菱UFJカード" },
  { person: "共通", category: "カード", account_name: "楽天カード" },
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
