import { NextResponse } from "next/server";

import { fetchElectricityTrend } from "@/lib/gas";

export async function GET() {
  try {
    const trend = await fetchElectricityTrend();
    return NextResponse.json({ ok: true, trend });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
