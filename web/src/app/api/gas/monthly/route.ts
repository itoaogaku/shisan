import { NextRequest, NextResponse } from "next/server";

import { fetchMonthlyData, saveMonthlyData } from "@/lib/gas";
import type { Category, Person } from "@/lib/types";

const VALID_PERSONS: Person[] = ["雅一", "穂夏", "共通"];
const VALID_CATEGORIES: Category[] = ["銀行", "証券", "暗号資産", "カード"];

export async function GET(request: NextRequest) {
  const yearMonth = request.nextUrl.searchParams.get("year_month");
  if (!yearMonth) {
    return NextResponse.json({ ok: false, error: "year_month is required" }, { status: 400 });
  }
  try {
    const data = await fetchMonthlyData(yearMonth);
    return NextResponse.json({ ok: true, year_month: yearMonth, data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface SaveMonthlyBody {
  year_month?: string;
  entries?: Array<{ person?: string; category?: string; account_name?: string; amount?: number }>;
}

export async function POST(request: NextRequest) {
  let body: SaveMonthlyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { year_month, entries } = body;
  if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
    return NextResponse.json({ ok: false, error: "year_month must be in YYYY-MM format" }, { status: 400 });
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ ok: false, error: "entries must be a non-empty array" }, { status: 400 });
  }

  for (const entry of entries) {
    if (
      !entry.person ||
      !VALID_PERSONS.includes(entry.person as Person) ||
      !entry.category ||
      !VALID_CATEGORIES.includes(entry.category as Category) ||
      !entry.account_name ||
      typeof entry.amount !== "number" ||
      Number.isNaN(entry.amount)
    ) {
      return NextResponse.json({ ok: false, error: `invalid entry: ${JSON.stringify(entry)}` }, { status: 400 });
    }
  }

  try {
    const saved = await saveMonthlyData(
      year_month,
      entries as Array<{ person: Person; category: Category; account_name: string; amount: number }>
    );
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
