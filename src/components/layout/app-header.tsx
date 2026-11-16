"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookImage, LayoutDashboard } from "lucide-react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme";
import { cn } from "@/lib/utils";

const NAV = [
  // «Exàmens» lleva a la lista de exàmens de l'inici (ancla), no solo a la parte superior de la página.
  { href: "/#examens", label: "Exàmens", icon: LayoutDashboard, active: (p: string) => p === "/" },
  { href: "/biblioteca", label: "Biblioteca de còmics", icon: BookImage, active: (p: string) => p.startsWith("/biblioteca") },
];

/**
 * Barra flotante de cristal. En reposo flota a 32px del borde con un desenfoque ligero; al hacer
 * scroll sube a 16px y el desenfoque se intensifica para mantener la legibilidad.
 */
export function AppHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        "glass fixed inset-x-0 top-8 z-30 mx-auto h-[52px] w-[calc(100%-1.5rem)] max-w-5xl rounded-[26px] sm:w-[calc(100%-3rem)]",
        "transition-[top,backdrop-filter,box-shadow] duration-200 data-[scrolled]:top-4 data-[scrolled]:glass-strong",
      )}
    >
      <div className="flex h-full items-center justify-between gap-3 py-2 pr-2 pl-4">
        <Link href="/" aria-label="Inici" className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-1" aria-label="Principal">
            {NAV.map((n) => {
              const active = n.active(pathname);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-[color,background-color,scale] duration-200 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none motion-safe:active:scale-[0.97]",
                    active && "text-foreground",
                  )}
                >
                  <n.icon className="size-4" />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
