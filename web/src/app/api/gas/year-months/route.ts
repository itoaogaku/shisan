import { NextResponse } from "next/server";

import { fetchYearMonths } from "@/lib/gas";

export async function GET() {
  try {
    const year_months = await fetchYearMonths();
    return NextResponse.json({ ok: true, year_months });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
