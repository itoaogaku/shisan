import "server-only";

import type {
  AccountDef,
  AnnualMemoRecord,
  ElectricityRecord,
  ElectricityTrendPoint,
  MemoAmountType,
  MemoFrequency,
  MemoRecord,
  MemoType,
  MonthlyEntry,
  TrendPoint,
} from "./types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `環境変数 ${name} が設定されていません。.env.local または Vercel の Environment Variables を確認してください。`
    );
  }
  return value;
}

async function parseGasResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `GAS からの応答をJSONとして解析できませんでした（status=${res.status}）。デプロイ設定やURLを確認してください。`
    );
  }
}

async function gasGet(action: string, params: Record<string, string> = {}) {
  const baseUrl = requireEnv("GAS_API_URL");
  const token = process.env.GAS_API_TOKEN ?? "";

  const url = new URL(baseUrl);
  url.searchParams.set("action", action);
  if (token) url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await parseGasResponse(res);
  if (!json.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "GAS API でエラーが発生しました");
  }
  return json;
}

async function gasPost(body: Record<string, unknown>) {
  const baseUrl = requireEnv("GAS_API_URL");
  const token = process.env.GAS_API_TOKEN ?? "";

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, token }),
  });
  const json = await parseGasResponse(res);
  if (!json.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "GAS API でエラーが発生しました");
  }
  return json;
}

export async function fetchAccounts(): Promise<AccountDef[]> {
  const json = await gasGet("getAccounts");
  return (json.accounts as AccountDef[]) ?? [];
}

export async function fetchYearMonths(): Promise<string[]> {
  const json = await gasGet("getYearMonths");
  return (json.year_months as string[]) ?? [];
}

export async function fetchMonthlyData(yearMonth: string): Promise<MonthlyEntry[]> {
  const json = await gasGet("getMonthlyData", { year_month: yearMonth });
  return (json.data as MonthlyEntry[]) ?? [];
}

export async function fetchTrend(): Promise<TrendPoint[]> {
  const json = await gasGet("getTrend");
  return (json.trend as TrendPoint[]) ?? [];
}

export async function saveMonthlyData(
  yearMonth: string,
  entries: Pick<MonthlyEntry, "person" | "category" | "account_name" | "amount">[]
): Promise<number> {
  const json = await gasPost({ action: "saveMonthlyData", year_month: yearMonth, entries });
  return (json.saved as number) ?? entries.length;
}

export async function fetchElectricityData(yearMonth: string): Promise<ElectricityRecord | null> {
  const json = await gasGet("getElectricityData", { year_month: yearMonth });
  return (json.data as ElectricityRecord | null) ?? null;
}

export async function fetchElectricityTrend(): Promise<ElectricityTrendPoint[]> {
  const json = await gasGet("getElectricityTrend");
  return (json.trend as ElectricityTrendPoint[]) ?? [];
}

export async function saveElectricity(
  yearMonth: string,
  income?: number | null,
  expense?: number | null,
  incomeKwh?: number | null,
  expenseKwh?: number | null
): Promise<void> {
  const body: Record<string, unknown> = { action: "saveElectricity", year_month: yearMonth };
  if (income !== undefined) body.income = income;
  if (expense !== undefined) body.expense = expense;
  if (incomeKwh !== undefined) body.income_kwh = incomeKwh;
  if (expenseKwh !== undefined) body.expense_kwh = expenseKwh;
  await gasPost(body);
}

export async function fetchMemos(): Promise<MemoRecord[]> {
  const json = await gasGet("getMemos");
  return (json.memos as MemoRecord[]) ?? [];
}

export async function addMemo(
  account: string,
  type: MemoType,
  frequency: MemoFrequency,
  amountType: MemoAmountType,
  dayOfMonth?: number,
  amount?: number,
  memo?: string
): Promise<string> {
  const body: Record<string, unknown> = { action: "addMemo", account, type, frequency, amount_type: amountType };
  if (dayOfMonth !== undefined) body.day_of_month = dayOfMonth;
  if (amount !== undefined) body.amount = amount;
  if (memo) body.memo = memo;
  const json = await gasPost(body);
  return json.id as string;
}

export async function deleteMemo(id: string): Promise<void> {
  await gasPost({ action: "deleteMemo", id });
}

export async function updateMemo(
  id: string,
  account: string,
  type: MemoType,
  frequency: MemoFrequency,
  amountType: MemoAmountType,
  dayOfMonth?: number,
  amount?: number,
  memo?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    action: "updateMemo",
    id,
    account,
    type,
    frequency,
    amount_type: amountType,
  };
  if (dayOfMonth !== undefined) body.day_of_month = dayOfMonth;
  if (amount !== undefined) body.amount = amount;
  if (memo) body.memo = memo;
  await gasPost(body);
}

export async function fetchAnnualMemos(): Promise<AnnualMemoRecord[]> {
  const json = await gasGet("getAnnualMemos");
  return (json.annual_memos as AnnualMemoRecord[]) ?? [];
}

export async function addAnnualMemo(
  itemName: string,
  paymentDate: string,
  amount?: number,
  note?: string
): Promise<string> {
  const body: Record<string, unknown> = { action: "addAnnualMemo", item_name: itemName, payment_date: paymentDate };
  if (amount !== undefined) body.amount = amount;
  if (note) body.note = note;
  const json = await gasPost(body);
  return json.id as string;
}

export async function deleteAnnualMemo(id: string): Promise<void> {
  await gasPost({ action: "deleteAnnualMemo", id });
}

export async function updateAnnualMemo(
  id: string,
  itemName: string,
  paymentDate: string,
  amount?: number,
  note?: string
): Promise<void> {
  const body: Record<string, unknown> = {
    action: "updateAnnualMemo",
    id,
    item_name: itemName,
    payment_date: paymentDate,
  };
  if (amount !== undefined) body.amount = amount;
  if (note) body.note = note;
  await gasPost(body);
}
