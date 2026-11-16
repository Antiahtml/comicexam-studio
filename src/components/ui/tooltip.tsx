"use client";

import * as React from "react";
import { Tooltip as T } from "radix-ui";

export const TooltipProvider = T.Provider;

export function Tip({ label, children, side = "bottom" }: { label: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] origin-(--radix-tooltip-content-transform-origin) rounded-lg bg-foreground/90 px-2 py-1 text-xs font-medium text-background shadow-md backdrop-blur-md [--materialize-blur:0px] [--materialize-scale:0.92] data-[state=delayed-open]:animate-materialize-in data-[state=closed]:animate-materialize-out"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
