"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/input", label: "データ入力" },
  { href: "/electricity", label: "売電買電" },
  { href: "/memo", label: "メモ" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 gap-0.5 overflow-x-auto text-sm font-medium sm:gap-1">
      {LINKS.map((link) => {
        const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-1.5 py-2 transition-colors sm:px-3",
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:border-brand/30 hover:text-brand"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
