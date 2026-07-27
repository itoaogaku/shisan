import { NextResponse } from "next/server";

import { fetchTrend } from "@/lib/gas";

export async function GET() {
  try {
    const trend = await fetchTrend();
    return NextResponse.json({ ok: true, trend });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
