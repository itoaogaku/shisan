import { NextRequest, NextResponse } from "next/server";

import { addMemo, deleteMemo, fetchMemos, updateMemo } from "@/lib/gas";
import type { MemoAmountType, MemoFrequency, MemoType } from "@/lib/types";

export async function GET() {
  try {
    const memos = await fetchMemos();
    return NextResponse.json({ ok: true, memos });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface MemoBody {
  account?: string;
  type?: MemoType;
  frequency?: MemoFrequency;
  day_of_month?: number;
  amount_type?: MemoAmountType;
  amount?: number;
  memo?: string;
}

function validateMemoBody(body: MemoBody): string | null {
  const { account, type, frequency, day_of_month, amount_type, amount } = body;
  if (!account || !account.trim()) return "account is required";
  if (type !== "入金" && type !== "出金") return 'type must be "入金" or "出金"';
  if (frequency !== "定期" && frequency !== "都度") return 'frequency must be "定期" or "都度"';
  if (frequency === "定期" && (typeof day_of_month !== "number" || day_of_month < 1 || day_of_month > 31)) {
    return "day_of_month must be between 1 and 31 when frequency is 定期";
  }
  if (amount_type !== "固定" && amount_type !== "変動") return 'amount_type must be "固定" or "変動"';
  if (amount !== undefined && (typeof amount !== "number" || Number.isNaN(amount))) {
    return "amount must be a number";
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: MemoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const validationError = validateMemoBody(body);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }
  const { account, type, frequency, day_of_month, amount_type, amount, memo } = body;

  try {
    const id = await addMemo(
      account!,
      type!,
      frequency!,
      amount_type!,
      frequency === "定期" ? day_of_month : undefined,
      amount_type === "固定" ? amount : undefined,
      memo
    );
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

interface UpdateMemoBody extends MemoBody {
  id?: string;
}

export async function PUT(request: NextRequest) {
  let body: UpdateMemoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }
  const validationError = validateMemoBody(body);
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  }
  const { account, type, frequency, day_of_month, amount_type, amount, memo } = body;

  try {
    await updateMemo(
      id,
      account!,
      type!,
      frequency!,
      amount_type!,
      frequency === "定期" ? day_of_month : undefined,
      amount_type === "固定" ? amount : undefined,
      memo
    );
    return NextResponse.json({ ok: true });
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
