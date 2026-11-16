import { Check, Scissors } from "lucide-react";

/**
 * Ilustración decorativa del hero: una hoja de examen sobria sobre una hoja de cristal, con líneas
 * finas y una viñeta en degradado suave. Sin contornos gruesos ni colores saturados.
 */
export function ExamIllustration({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="relative h-[340px] w-[300px]">
        {/* Hoja trasera de cristal */}
        <div className="glass absolute top-0 left-10 h-[300px] w-[230px] rotate-[7deg] rounded-[28px]" />

        {/* Hoja principal */}
        <div className="absolute top-6 left-0 flex h-[300px] w-[236px] -rotate-[2deg] flex-col gap-4 rounded-[28px] border border-border bg-card p-5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.25),0_8px_20px_-8px_rgb(0_0_0/0.12)]">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-full bg-secondary" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2 w-24 rounded-full bg-foreground/80" />
              <div className="h-1.5 w-16 rounded-full bg-foreground/15" />
            </div>
          </div>

          {/* Vinyeta */}
          <div className="relative h-[104px] overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#cfe6f1,#f6e6c8_70%,#f3d6cf)] dark:bg-[linear-gradient(135deg,#25414a,#4a4023_70%,#4a2f2a)]">
            <div className="absolute -right-5 -bottom-8 size-24 rounded-full bg-white/45 dark:bg-white/10" />
            <div className="absolute bottom-3 left-3 size-9 rounded-full bg-white/60 dark:bg-white/15" />
          </div>

          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-foreground/20" />
            <div className="h-2 w-4/5 rounded-full bg-foreground/20" />
          </div>
          <div className="mt-auto space-y-3">
            <div className="h-px w-full bg-border" />
            <div className="h-px w-full bg-border" />
          </div>
        </div>

        {/* Detalles de cristal */}
        <div className="glass glass-strong absolute top-1 -left-4 flex size-11 items-center justify-center rounded-full text-foreground">
          <Scissors className="size-[18px]" />
        </div>
        <div className="glass glass-strong absolute right-2 bottom-0 flex size-11 items-center justify-center rounded-full text-foreground">
          <Check className="size-[18px]" />
        </div>
      </div>
    </div>
  );
}
