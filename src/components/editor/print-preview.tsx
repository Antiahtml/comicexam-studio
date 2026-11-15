"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, Loader2, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoMark } from "@/components/layout/logo";
import { printFrame, printViewUrl, waitForPrintReady } from "@/lib/print";

/** Vista previa de impresión: el documento tal y como saldrá en papel, con el botón para imprimir o guardar en PDF. */
export function PrintPreview({ projectId, name }: { projectId: string; name: string }) {
  const [fileName, setFileName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  const print = async () => {
    if (!frame.current) return;
    setBusy(true);
    try {
      const { errors } = await waitForPrintReady(frame.current);
      if (errors > 0) toast.warning(`${errors} imagen(es) no están disponibles y saldrán como aviso.`);
      await printFrame(frame.current, fileName.trim() || name);
    } catch (err) {
      toast.error("No se ha podido imprimir", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/editor?id=${projectId}`}>
            <ArrowLeft /> Volver al editor
          </Link>
        </Button>
        <LogoMark className="size-7" />
        <h1 className="truncate text-sm font-semibold">Vista previa · {name}</h1>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => {
            setNonce((n) => n + 1);
            setLoading(true);
          }}
          aria-label="Actualizar"
        >
          <RefreshCw />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Input value={fileName} onChange={(e) => setFileName(e.target.value)} className="h-8 w-56" aria-label="Nombre del archivo" />
          <span className="text-sm text-muted-foreground">.pdf</span>
          <Button size="sm" disabled={busy || loading} onClick={print} data-testid="preview-print">
            {busy ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir / Guardar PDF
          </Button>
        </div>
      </header>
      <p className="flex items-center justify-center gap-2 border-b bg-secondary/60 px-3 py-1.5 text-xs text-secondary-foreground">
        <Info className="size-3.5" /> Se abrirá la ventana de impresión: elige la impresora o, como destino, <strong>«Guardar como PDF»</strong>.
      </p>
      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-canvas text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" /> Preparando la vista de impresión…
          </div>
        )}
        <iframe
          key={nonce}
          ref={frame}
          src={printViewUrl(projectId)}
          title="Vista previa"
          className="size-full border-0"
          onLoad={() => setLoading(false)}
          data-testid="preview-frame"
        />
      </div>
    </div>
  );
}
