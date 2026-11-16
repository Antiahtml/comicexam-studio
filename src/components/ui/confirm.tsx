"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  variant?: "default" | "destructive" | "outline";
}

interface ChoiceOptions<T extends string> {
  title: string;
  description?: React.ReactNode;
  /** El primero es la opción recomendada (recibe el foco). */
  options: ChoiceOption<T>[];
  cancelLabel?: string;
}

type ChoiceState = ChoiceOptions<string> & { resolve: (v: string | null) => void };

const ChoiceContext = React.createContext<<T extends string>(o: ChoiceOptions<T>) => Promise<T | null>>(async () => null);

/** Proveedor de diálogos de confirmación y de elección accesibles (sustituye a window.confirm). */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ChoiceState | null>(null);
  const choose = React.useCallback(
    <T extends string>(o: ChoiceOptions<T>) =>
      new Promise<T | null>((resolve) => setState({ ...(o as ChoiceOptions<string>), resolve: resolve as (v: string | null) => void })),
    [],
  );
  const close = (v: string | null) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ChoiceContext.Provider value={choose}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && close(null)}>
        <DialogContent className="z-[70] sm:max-w-md" hideClose data-testid="choice-dialog">
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
            {state?.description && <DialogDescription asChild><div>{state.description}</div></DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(null)}>
              {state?.cancelLabel ?? "Cancel·la"}
            </Button>
            {[...(state?.options ?? [])].reverse().map((o, i, arr) => (
              <Button key={o.value} variant={o.variant ?? "default"} onClick={() => close(o.value)} autoFocus={i === arr.length - 1}>
                {o.label}
              </Button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ChoiceContext.Provider>
  );
}

/** Diálogo con varias opciones. Devuelve el valor elegido o null si se cancela. */
export const useChoice = () => React.useContext(ChoiceContext);

/** Confirmación sí/no. */
export function useConfirm() {
  const choose = useChoice();
  return React.useCallback(
    async (o: ConfirmOptions) =>
      (await choose({
        title: o.title,
        description: o.description,
        options: [{ value: "ok", label: o.confirmLabel ?? "Accepta", variant: o.destructive ? "destructive" : "default" }],
      })) === "ok",
    [choose],
  );
}
