"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  clientToNormalized,
  moveRect,
  rectFromPoints,
  resizeRect,
  type Handle,
  type NormRect,
  type Point,
} from "@/lib/regions/coords";

export interface Region {
  key: string;
  rect: NormRect;
  label: string;
  saved: boolean;
}

type Drag =
  | { kind: "draw"; start: Point; current: Point }
  | { kind: "move"; key: string; start: Point; orig: NormRect }
  | { kind: "resize"; key: string; handle: Handle; start: Point; orig: NormRect };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POS: Record<Handle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

/**
 * Capa de selección rectangular sobre una página.
 * Trabaja SIEMPRE en coordenadas normalizadas (0..1): el zoom de la vista no afecta al resultado.
 */
export function RegionSelector({
  regions,
  activeKey,
  drawEnabled,
  onSelect,
  onCreate,
  onChange,
  onCommit,
}: {
  regions: Region[];
  activeKey: string | null;
  drawEnabled: boolean;
  onSelect: (key: string | null) => void;
  onCreate: (rect: NormRect) => void;
  /** Cambio en curso (arrastre). */
  onChange: (key: string, rect: NormRect) => void;
  /** Cambio terminado (al soltar). */
  onCommit: (key: string, rect: NormRect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const lastRect = useRef<NormRect | null>(null);

  const toNorm = (e: React.PointerEvent): Point => {
    const box = ref.current!.getBoundingClientRect();
    return clientToNormalized(e.clientX, e.clientY, box);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    const key = target.closest<HTMLElement>("[data-region]")?.dataset.region;
    const p = toNorm(e);
    if (key) {
      const region = regions.find((r) => r.key === key);
      if (!region) return;
      e.stopPropagation();
      onSelect(key);
      ref.current!.setPointerCapture(e.pointerId);
      setDrag(handle ? { kind: "resize", key, handle, start: p, orig: region.rect } : { kind: "move", key, start: p, orig: region.rect });
      return;
    }
    if (!drawEnabled) {
      onSelect(null);
      return;
    }
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    onSelect(null);
    setDrag({ kind: "draw", start: p, current: p });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toNorm(e);
    if (drag.kind === "draw") {
      setDrag({ ...drag, current: p });
      return;
    }
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    const rect = drag.kind === "move" ? moveRect(drag.orig, dx, dy) : resizeRect(drag.orig, drag.handle, dx, dy);
    lastRect.current = rect;
    onChange(drag.key, rect);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    ref.current?.releasePointerCapture(e.pointerId);
    if (drag.kind === "draw") {
      const rect = rectFromPoints(drag.start, toNorm(e));
      const box = ref.current!.getBoundingClientRect();
      // Se ignoran clics accidentales (menos de 8 px en pantalla).
      if (rect.w * box.width > 8 && rect.h * box.height > 8) onCreate(rect);
    } else if (lastRect.current) {
      onCommit(drag.key, lastRect.current);
    }
    lastRect.current = null;
    setDrag(null);
  };

  const drawing = drag?.kind === "draw" ? rectFromPoints(drag.start, drag.current) : null;

  return (
    <div
      ref={ref}
      className={cn("absolute inset-0 touch-none select-none", drawEnabled ? "cursor-crosshair" : "cursor-default")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="region-layer"
    >
      {/* Oscurece el resto de la página cuando hay una región activa */}
      {regions.map((r, i) => {
        const active = r.key === activeKey;
        return (
          <div
            key={r.key}
            data-region={r.key}
            className={cn(
              "absolute border-2 transition-shadow",
              active ? "z-20 cursor-move border-primary shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" : "z-10 cursor-pointer hover:bg-primary/10",
              r.saved ? (active ? "" : "border-emerald-500") : active ? "" : "border-dashed border-amber-500",
            )}
            style={{ left: `${r.rect.x * 100}%`, top: `${r.rect.y * 100}%`, width: `${r.rect.w * 100}%`, height: `${r.rect.h * 100}%` }}
          >
            <span
              className={cn(
                "pointer-events-none absolute -top-px -left-px rounded-br-md px-1.5 py-0.5 text-[11px] font-bold text-white",
                active ? "bg-primary" : r.saved ? "bg-emerald-500" : "bg-amber-500",
              )}
            >
              {i + 1}
            </span>
            {active &&
              HANDLES.map((h) => (
                <span
                  key={h}
                  data-handle={h}
                  className={cn("absolute z-30 size-3 rounded-sm border-2 border-primary bg-white shadow", HANDLE_POS[h])}
                />
              ))}
          </div>
        );
      })}
      {drawing && (
        <div
          className="absolute z-30 border-2 border-dashed border-primary bg-primary/15"
          style={{ left: `${drawing.x * 100}%`, top: `${drawing.y * 100}%`, width: `${drawing.w * 100}%`, height: `${drawing.h * 100}%` }}
        />
      )}
    </div>
  );
}

/** Previsualización instantánea del recorte (sin pedir nada al servidor). */
export function CropPreview({
  imageUrl,
  rect,
  pageWidth,
  pageHeight,
  className,
}: {
  imageUrl: string;
  rect: NormRect;
  pageWidth: number;
  pageHeight: number;
  className?: string;
}) {
  const aspect = (rect.w * pageWidth) / (rect.h * pageHeight);
  const posX = rect.w >= 0.9999 ? 0 : (rect.x / (1 - rect.w)) * 100;
  const posY = rect.h >= 0.9999 ? 0 : (rect.y / (1 - rect.h)) * 100;
  return (
    <div
      className={cn("w-full bg-muted bg-no-repeat", className)}
      style={{
        aspectRatio: String(aspect),
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: `${100 / rect.w}% ${100 / rect.h}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}
