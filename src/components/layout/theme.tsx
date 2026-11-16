"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ThemePreference = "light" | "dark" | "system";

const KEY = "comicexam-theme";
const ORDER: ThemePreference[] = ["system", "light", "dark"];
const LABEL: Record<ThemePreference, string> = { system: "Tema: automático", light: "Tema: claro", dark: "Tema: oscuro" };

/**
 * Script que se ejecuta antes de pintar (evita el parpadeo claro→oscuro): aplica la clase `dark`
 * según la preferencia guardada o, si no hay, la del sistema.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const notify = () => listeners.forEach((l) => l());

/** Alterna entre automático, claro y oscuro. Con «automático» sigue al sistema en vivo. */
export function ThemeToggle({ className }: { className?: string }) {
  // Se lee de localStorage como almacén externo: en el servidor y en la hidratación vale «system».
  const pref = React.useSyncExternalStore<ThemePreference>(subscribe, readPreference, () => "system");

  React.useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readPreference() === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next = () => {
    const n = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    try {
      if (n === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, n);
    } catch {
      /* sin almacenamiento: el cambio vale solo para esta sesión */
    }
    apply(n);
    notify();
  };

  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  return (
    <Tip label={LABEL[pref]}>
      <button
        type="button"
        onClick={next}
        aria-label={`${LABEL[pref]}. Pulsa para cambiar`}
        data-testid="theme-toggle"
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,scale] duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none motion-safe:active:scale-90",
          className,
        )}
      >
        <Icon className="size-4" />
      </button>
    </Tip>
  );
}
