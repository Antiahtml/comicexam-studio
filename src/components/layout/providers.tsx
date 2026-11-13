"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </TooltipProvider>
  );
}
