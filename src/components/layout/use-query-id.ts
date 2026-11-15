"use client";

import { useSearchParams } from "next/navigation";

/** Las páginas son estáticas: el examen o cómic se indica en la URL (?id=…). */
export function useQueryId(): string | null {
  const id = useSearchParams().get("id");
  return id && /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null;
}
