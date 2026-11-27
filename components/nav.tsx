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
    <nav aria-label="Hauptmenü" className="flex flex-wrap items-stretch gap-1 border-b border-border bg-card px-4 print:hidden">
      <Link href="/scan" className="mr-6 inline-flex min-h-14 items-center gap-2.5 text-[0.95rem] font-semibold">
        {/* Same bowl as the app icon (build/icon.svg). */}
        <svg aria-hidden viewBox="0 0 256 256" className="size-7 shrink-0">
          <rect width="256" height="256" rx="56" fill="#B23A2E" />
          <path d="M60 118 A68 16 0 0 0 196 118 L184 176 Q128 208 72 176 Z" fill="#FBF3E7" />
          <ellipse cx="128" cy="118" rx="68" ry="16" fill="#FBF3E7" />
          <path d="M104 96 C92 80 112 68 100 50" fill="none" stroke="#E39B57" strokeWidth="12" strokeLinecap="round" />
          <path d="M142 96 C130 80 150 68 138 50" fill="none" stroke="#E39B57" strokeWidth="12" strokeLinecap="round" />
        </svg>
        Asia To Go
      </Link>
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Active = amber bar under the tab, not a filled button: the accent stays for the page's main action.
              "relative inline-flex min-h-14 items-center px-3.5 text-sm transition-colors",
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-transparent",
              active ? "font-medium text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
