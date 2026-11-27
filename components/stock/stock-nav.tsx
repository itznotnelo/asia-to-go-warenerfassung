"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/stock", label: "Übersicht", exact: true },
  { href: "/stock/receipts", label: "Wareneingang" },
  { href: "/stock/sale", label: "Verkauf erfassen" },
  { href: "/stock/counts", label: "Inventur" },
  { href: "/stock/expiry", label: "Haltbarkeit" },
  { href: "/stock/reorder", label: "Nachbestellen" },
  { href: "/stock/inventory", label: "Inventarliste" },
  { href: "/stock/movements", label: "Buchungen" },
  { href: "/stock/suppliers", label: "Lieferanten" },
];

/** Second row under the main nav for everything around the stock. Hidden when printing. */
export function StockNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Lager" className="flex flex-wrap items-stretch gap-1 border-b border-border px-4 print:hidden">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-12 items-center px-3 text-sm transition-colors",
              "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:bg-transparent",
              active ? "font-medium text-foreground after:bg-foreground/70" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
