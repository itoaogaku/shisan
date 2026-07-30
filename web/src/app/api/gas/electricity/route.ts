import { NextRequest, NextResponse } from "next/server";

import { fetchElectricityData, saveElectricity } from "@/lib/gas";

export async function GET(request: NextRequest) {
  const yearMonth = request.nextUrl.searchParams.get("year_month");
  if (!yearMonth) {
    return NextResponse.json({ ok: false, error: "year_month is required" }, { status: 400 });
  }
  try {
    const data = await fetchElectricityData(yearMonth);
    return NextResponse.json({ ok: true, year_month: yearMonth, data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface SaveElectricityBody {
  year_month?: string;
  income?: number | null;
  expense?: number | null;
  income_kwh?: number | null;
  expense_kwh?: number | null;
}

// undefined = 未指定（既存値を保持）, null = 明示的なリセット（空欄に戻す）, どちらも許可する。
function isValidOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "number" && !Number.isNaN(value));
}

export async function POST(request: NextRequest) {
  let body: SaveElectricityBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { year_month, income, expense, income_kwh, expense_kwh } = body;
  if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
    return NextResponse.json({ ok: false, error: "year_month must be in YYYY-MM format" }, { status: 400 });
  }
  if (income === undefined && expense === undefined && income_kwh === undefined && expense_kwh === undefined) {
    return NextResponse.json(
      { ok: false, error: "income, expense, income_kwh or expense_kwh is required" },
      { status: 400 }
    );
  }
  if (
    !isValidOptionalNumber(income) ||
    !isValidOptionalNumber(expense) ||
    !isValidOptionalNumber(income_kwh) ||
    !isValidOptionalNumber(expense_kwh)
  ) {
    return NextResponse.json(
      { ok: false, error: "income, expense, income_kwh and expense_kwh must be numbers" },
      { status: 400 }
    );
  }

  try {
    await saveElectricity(year_month, income, expense, income_kwh, expense_kwh);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
