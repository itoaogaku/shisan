import { NextResponse } from "next/server";

import { fetchAccounts } from "@/lib/gas";

export async function GET() {
  try {
    const accounts = await fetchAccounts();
    return NextResponse.json({ ok: true, accounts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
