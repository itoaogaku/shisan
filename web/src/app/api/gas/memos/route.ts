import { NextRequest, NextResponse } from "next/server";

import { addMemo, deleteMemo, fetchMemos } from "@/lib/gas";
import type { MemoAmountType, MemoFrequency, MemoType } from "@/lib/types";

export async function GET() {
  try {
    const memos = await fetchMemos();
    return NextResponse.json({ ok: true, memos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface AddMemoBody {
  account?: string;
  type?: MemoType;
  frequency?: MemoFrequency;
  day_of_month?: number;
  amount_type?: MemoAmountType;
  amount?: number;
  memo?: string;
}

export async function POST(request: NextRequest) {
  let body: AddMemoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { account, type, frequency, day_of_month, amount_type, amount, memo } = body;
  if (!account || !account.trim()) {
    return NextResponse.json({ ok: false, error: "account is required" }, { status: 400 });
  }
  if (type !== "入金" && type !== "出金") {
    return NextResponse.json({ ok: false, error: 'type must be "入金" or "出金"' }, { status: 400 });
  }
  if (frequency !== "定期" && frequency !== "都度") {
    return NextResponse.json({ ok: false, error: 'frequency must be "定期" or "都度"' }, { status: 400 });
  }
  if (frequency === "定期" && (typeof day_of_month !== "number" || day_of_month < 1 || day_of_month > 31)) {
    return NextResponse.json(
      { ok: false, error: "day_of_month must be between 1 and 31 when frequency is 定期" },
      { status: 400 }
    );
  }
  if (amount_type !== "固定" && amount_type !== "変動") {
    return NextResponse.json({ ok: false, error: 'amount_type must be "固定" or "変動"' }, { status: 400 });
  }
  if (amount !== undefined && (typeof amount !== "number" || Number.isNaN(amount))) {
    return NextResponse.json({ ok: false, error: "amount must be a number" }, { status: 400 });
  }

  try {
    const id = await addMemo(
      account,
      type,
      frequency,
      amount_type,
      frequency === "定期" ? day_of_month : undefined,
      amount_type === "固定" ? amount : undefined,
      memo
    );
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
