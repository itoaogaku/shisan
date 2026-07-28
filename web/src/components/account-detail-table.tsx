import { Fragment } from "react";

import { ACCOUNTS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/accounts";
import { formatYearMonthLabel, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, MonthlyEntry } from "@/lib/types";

const CATEGORIES: Category[] = ["銀行", "証券", "暗号資産", "カード"];

interface AccountDetailTableProps {
  entries: MonthlyEntry[];
  previousEntries: MonthlyEntry[];
  previousYearMonth: string;
}

function buildAmountMap(entries: MonthlyEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  entries.forEach((e) => map.set(`${e.person}|${e.category}|${e.account_name}`, e.amount));
  return map;
}

function rowTint(category: Category): string {
  return `color-mix(in srgb, ${CATEGORY_COLORS[category]} 8%, var(--card))`;
}

export function AccountDetailTable({ entries, previousEntries, previousYearMonth }: AccountDetailTableProps) {
  const currentMap = buildAmountMap(entries);
  const previousMap = buildAmountMap(previousEntries);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">名義</th>
            <th className="py-2 pr-4 font-medium">口座</th>
            <th className="py-2 pr-4 text-right font-medium">金額</th>
            <th className="py-2 pl-4 text-right font-medium">
              前月（{formatYearMonthLabel(previousYearMonth)}）比
            </th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((category) => {
            const accountsInCategory = ACCOUNTS.filter((a) => a.category === category);
            if (accountsInCategory.length === 0) return null;
            const color = CATEGORY_COLORS[category];

            return (
              <Fragment key={category}>
                <tr style={{ backgroundColor: rowTint(category) }}>
                  <td
                    colSpan={4}
                    className="border-l-4 py-1.5 pl-3 text-xs font-semibold text-foreground"
                    style={{ borderLeftColor: color }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {CATEGORY_LABELS[category]}
                    </span>
                  </td>
                </tr>
                {accountsInCategory.map((a) => {
                  const key = `${a.person}|${a.category}|${a.account_name}`;
                  const amount = currentMap.get(key);
                  const prevAmount = previousMap.get(key);
                  const diff = amount !== undefined && prevAmount !== undefined ? amount - prevAmount : null;
                  const isCard = a.category === "カード";
                  const isGoodDirection = diff !== null && diff !== 0 && (isCard ? diff < 0 : diff > 0);
                  const isBadDirection = diff !== null && diff !== 0 && !isGoodDirection;

                  return (
                    <tr
                      key={key}
                      className="border-b border-border/60 last:border-0"
                      style={{ backgroundColor: rowTint(category) }}
                    >
                      <td
                        className="border-l-4 py-2 pl-3 pr-4 text-muted-foreground"
                        style={{ borderLeftColor: color }}
                      >
                        {a.person}
                      </td>
                      <td className="py-2 pr-4">{a.account_name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {amount !== undefined ? (
                          formatYen(amount)
                        ) : (
                          <span className="text-muted-foreground">未入力</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-4 text-right tabular-nums",
                          diff === null && "text-muted-foreground",
                          isGoodDirection && "text-success-text",
                          isBadDirection && "text-destructive"
                        )}
                      >
                        {diff === null ? "—" : diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${formatYen(diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
