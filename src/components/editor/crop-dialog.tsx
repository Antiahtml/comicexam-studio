"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RegionSelector, CropPreview } from "@/components/comics/region-selector";
import { pageImageUrl } from "@/lib/images/urls";
import { FULL_RECT, type NormRect } from "@/lib/regions/coords";
import type { ImageSource } from "@/lib/document/types";

/** Ajuste del recorte de una imagen ya insertada, sobre la página ORIGINAL del cómic. */
export function CropDialog({
  open,
  onOpenChange,
  src,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  src: ImageSource;
  onSave: (rect: NormRect) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl sm:max-w-5xl">
        {open && <CropBody src={src} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Contenido del diálogo: se monta al abrir, partiendo del recorte actual. */
function CropBody({ src, onSave, onClose }: { src: ImageSource; onSave: (rect: NormRect) => void; onClose: () => void }) {
  const [rect, setRect] = useState<NormRect>(src.crop);
  const aspect = src.pageWidth / src.pageHeight;
  return (
    <>
        <DialogHeader>
          <DialogTitle>Recortar imagen</DialogTitle>
          <DialogDescription>Arrastra los bordes o las esquinas, o dibuja un nuevo rectángulo. El recorte se aplica sobre la imagen original, sin perder calidad.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <div className="flex max-h-[68vh] items-center justify-center overflow-auto rounded-lg bg-canvas p-3">
            <div className="relative bg-white shadow" style={{ height: "min(64vh, 900px)", aspectRatio: String(aspect), maxWidth: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pageImageUrl(src.pageId, "preview")} alt="" className="pointer-events-none size-full select-none" draggable={false} />
              <RegionSelector
                regions={[{ key: "crop", rect, label: "Recorte", saved: true }]}
                activeKey="crop"
                drawEnabled
                onSelect={() => undefined}
                onCreate={setRect}
                onChange={(_, r) => setRect(r)}
                onCommit={(_, r) => setRect(r)}
              />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Vista previa</p>
            <div className="checker overflow-hidden rounded border">
              <CropPreview imageUrl={pageImageUrl(src.pageId, "preview")} rect={rect} pageWidth={src.pageWidth} pageHeight={src.pageHeight} />
            </div>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {Math.round(rect.w * src.pageWidth)} × {Math.round(rect.h * src.pageHeight)} px originales
            </p>
            <Button variant="outline" size="sm" onClick={() => setRect(FULL_RECT)}>
              <RotateCcw /> Página completa
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(rect);
              onClose();
            }}
          >
            Aplicar recorte
          </Button>
        </DialogFooter>
    </>
  );
}
