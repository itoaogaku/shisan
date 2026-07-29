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
  income?: number;
  expense?: number;
}

export async function POST(request: NextRequest) {
  let body: SaveElectricityBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { year_month, income, expense } = body;
  if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
    return NextResponse.json({ ok: false, error: "year_month must be in YYYY-MM format" }, { status: 400 });
  }
  if (income === undefined && expense === undefined) {
    return NextResponse.json({ ok: false, error: "income or expense is required" }, { status: 400 });
  }
  if (income !== undefined && (typeof income !== "number" || Number.isNaN(income))) {
    return NextResponse.json({ ok: false, error: "income must be a number" }, { status: 400 });
  }
  if (expense !== undefined && (typeof expense !== "number" || Number.isNaN(expense))) {
    return NextResponse.json({ ok: false, error: "expense must be a number" }, { status: 400 });
  }

  try {
    await saveElectricity(year_month, income, expense);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
