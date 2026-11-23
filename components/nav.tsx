"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/scan", label: "Scannen" },
  { href: "/products", label: "Artikel" },
  { href: "/stock", label: "Lager" },
  { href: "/orders", label: "Bestellungen" },
  { href: "/dashboard", label: "Fortschritt" },
  { href: "/settings", label: "Einstellungen" },
];

/** Persistente Navigation auf jeder Seite — vorher hatte /scan gar keine Links zu den anderen Seiten. */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-3 print:hidden">
      <span className="mr-4 text-sm text-muted-foreground">Asia To Go</span>
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex min-h-11 items-center rounded-lg px-4 text-sm",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
