"use client";

import * as React from "react";
import { Switch as SwitchPrimitive, Popover as P } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-slate-200",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-300 data-[state=checked]:translate-x-[calc(100%)] data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Badge({ className, variant = "default", ...props }: React.ComponentProps<"span"> & { variant?: "default" | "muted" | "warning" | "error" | "success" }) {
  const styles = {
    default: "bg-secondary text-secondary-foreground",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-amber-100 text-amber-800",
    error: "bg-red-100 text-red-700",
    success: "bg-green-100 text-green-700",
  }[variant];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium", styles, className)} {...props} />;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div className={cn(vertical ? "mx-1 h-6 w-px" : "my-2 h-px w-full", "bg-border", className)} />;
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn("z-50 rounded-xl border border-black/5 bg-popover p-3 shadow-lg outline-none origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-materialize-in data-[state=closed]:animate-materialize-out", className)}
        {...props}
      />
    </P.Portal>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary [&_svg]:size-6">{icon}</div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-label="Cargando" />;
}
