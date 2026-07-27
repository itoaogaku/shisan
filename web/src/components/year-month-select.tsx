"use client";

import { useRouter } from "next/navigation";

import { formatYearMonthLabel } from "@/lib/format";

interface YearMonthSelectProps {
  value: string;
  options: string[];
}

export function YearMonthSelect({ value, options }: YearMonthSelectProps) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(`/?ym=${encodeURIComponent(e.target.value)}`)}
      className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((ym) => (
        <option key={ym} value={ym}>
          {formatYearMonthLabel(ym)}
        </option>
      ))}
    </select>
  );
}
