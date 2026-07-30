import { NextRequest, NextResponse } from "next/server";

import { addAnnualMemo, deleteAnnualMemo, fetchAnnualMemos } from "@/lib/gas";

export async function GET() {
  try {
    const annualMemos = await fetchAnnualMemos();
    return NextResponse.json({ ok: true, annual_memos: annualMemos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface AddAnnualMemoBody {
  item_name?: string;
  payment_date?: string;
  amount?: number;
  note?: string;
}

export async function POST(request: NextRequest) {
  let body: AddAnnualMemoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { item_name, payment_date, amount, note } = body;
  if (!item_name || !item_name.trim()) {
    return NextResponse.json({ ok: false, error: "item_name is required" }, { status: 400 });
  }
  if (!payment_date || !payment_date.trim()) {
    return NextResponse.json({ ok: false, error: "payment_date is required" }, { status: 400 });
  }
  if (amount !== undefined && (typeof amount !== "number" || Number.isNaN(amount))) {
    return NextResponse.json({ ok: false, error: "amount must be a number" }, { status: 400 });
  }

  try {
    const id = await addAnnualMemo(item_name, payment_date, amount, note);
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }
  try {
    await deleteAnnualMemo(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
