import { NextRequest, NextResponse } from "next/server";

import { addMemo, deleteMemo, fetchMemos } from "@/lib/gas";

export async function GET() {
  try {
    const memos = await fetchMemos();
    return NextResponse.json({ ok: true, memos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface AddMemoBody {
  date?: string;
  memo?: string;
  account?: string;
  amount?: number;
}

export async function POST(request: NextRequest) {
  let body: AddMemoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { date, memo, account, amount } = body;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "date must be in YYYY-MM-DD format" }, { status: 400 });
  }
  if (!memo || !memo.trim()) {
    return NextResponse.json({ ok: false, error: "memo is required" }, { status: 400 });
  }
  if (amount !== undefined && (typeof amount !== "number" || Number.isNaN(amount))) {
    return NextResponse.json({ ok: false, error: "amount must be a number" }, { status: 400 });
  }

  try {
    const id = await addMemo(date, memo, account, amount);
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
    await deleteMemo(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
