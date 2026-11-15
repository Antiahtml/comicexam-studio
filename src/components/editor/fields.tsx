"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/input";

/** Controles compactos del panel de propiedades. */

export function Section({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn("space-y-2.5 border-b px-4 py-3", className)}>
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
  className,
  testId,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  testId?: string;
}) {
  const format = (v: number) => String(Math.round(v * 100) / 100);
  // Mientras se escribe se muestra el texto tecleado; el resto del tiempo, el valor real.
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? format(value);
  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      {label && <span className="text-2xs font-medium text-muted-foreground">{label}</span>}
      <span className="flex h-8 items-center rounded-md border border-input bg-card pr-2 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={shown}
          data-testid={testId}
          onFocus={() => setText(format(value))}
          onBlur={(e) => {
            commit(e.target.value);
            setText(null);
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
          className="h-full w-full min-w-0 bg-transparent px-2 text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="text-2xs text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );
}

export function TextField({
  value,
  onChange,
  multiline,
  placeholder,
  rows = 3,
  testId,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  rows?: number;
  testId?: string;
  autoFocus?: boolean;
}) {
  const cls =
    "w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30";
  return multiline ? (
    <textarea
      className={cn(cls, "resize-y")}
      rows={rows}
      value={value}
      placeholder={placeholder}
      data-testid={testId}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  ) : (
    <input
      className={cn(cls, "h-8")}
      value={value}
      placeholder={placeholder}
      data-testid={testId}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

export function ColorField({ value, onChange, allowNone, label }: { value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-16 shrink-0 text-2xs font-medium text-muted-foreground">{label}</span>}
      <label className={cn("relative size-8 shrink-0 overflow-hidden rounded-md border border-input shadow-xs", !value && "checker")}>
        <input type="color" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} className="absolute -inset-2 size-12 cursor-pointer opacity-0" />
        {value && <span className="block size-full" style={{ background: value }} />}
      </label>
      <input
        value={value ?? ""}
        placeholder={allowNone ? "Sin color" : "#000000"}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (!v && allowNone) onChange(null);
          else if (/^#[0-9a-f]{6}$/i.test(v)) onChange(v);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 font-mono text-xs uppercase outline-none focus-visible:border-ring"
      />
      {allowNone && value && (
        <button className="shrink-0 text-2xs text-muted-foreground hover:text-foreground" onClick={() => onChange(null)}>
          Quitar
        </button>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-md border border-input bg-muted p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center gap-1 rounded-[5px] px-2 text-xs font-medium text-muted-foreground transition-colors [&_svg]:size-4",
            value === o.value && "bg-card text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-sm">{label}</span>
        {description && <span className="block text-2xs text-muted-foreground">{description}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}
