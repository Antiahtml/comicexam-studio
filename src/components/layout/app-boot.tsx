"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { BASE_PATH } from "@/lib/env";
import { LogoMark } from "./logo";

type State = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * Arranque de la aplicación: registra el service worker que sirve las imágenes guardadas en el
 * navegador y espera a que controle la página antes de mostrar nada.
 */
export function AppBoot({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("indexedDB" in window)) {
        setState({
          kind: "error",
          message: "Aquest navegador no permet desar dades a l'equip (o ets en una finestra privada). Utilitza Chrome, Edge, Firefox o Safari actualitzats en una finestra normal.",
        });
        return;
      }
      try {
        await navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          // Primera visita: el service worker toma el control en cuanto se activa.
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, 4000);
            navigator.serviceWorker.addEventListener("controllerchange", () => {
              clearTimeout(t);
              resolve();
            }, { once: true });
          });
        }
        if (!navigator.serviceWorker.controller) {
          // Recarga forzada (Mayús+Recargar) desactiva el service worker: se recarga normal.
          window.location.reload();
          return;
        }
        if (!cancelled) setState({ kind: "ready" });
      } catch {
        if (!cancelled)
          setState({
            kind: "error",
            message: "No s'ha pogut preparar l'aplicació en aquest navegador. Recarrega la pàgina; si continua fallant, prova-ho amb Chrome o Edge.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "ready") return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center" data-testid="app-boot">
      <LogoMark className="size-12" />
      {state.kind === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Preparant ComicExam Studio…
        </p>
      ) : (
        <div className="max-w-md space-y-2">
          <p className="flex items-center justify-center gap-2 font-semibold">
            <TriangleAlert className="size-5 text-amber-600" /> No es pot obrir l’aplicació
          </p>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      )}
    </div>
  );
}
