"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, FileText, Loader2, MonitorSmartphone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoMark } from "@/components/layout/logo";
import { downloadPdf } from "./export-dialog";
import { cn } from "@/lib/utils";

/** Vista previa de impresión: muestra el documento sin controles o el PDF final generado por Chromium. */
export function PrintPreview({ projectId, name }: { projectId: string; name: string }) {
  const [mode, setMode] = useState<"html" | "pdf">("pdf");
  const [fileName, setFileName] = useState(name);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);

  const src = mode === "pdf" ? `/api/projects/${projectId}/pdf?inline=1&n=${nonce}` : `/print/${projectId}?n=${nonce}`;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/editor/${projectId}`}>
            <ArrowLeft /> Volver al editor
          </Link>
        </Button>
        <LogoMark className="size-7" />
        <h1 className="truncate text-sm font-semibold">Vista previa · {name}</h1>
        <div className="ml-4 flex rounded-md border bg-muted p-0.5">
          {(
            [
              ["pdf", "PDF final", FileText],
              ["html", "Vista rápida", MonitorSmartphone],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setLoading(true);
              }}
              className={cn("flex items-center gap-1.5 rounded-[5px] px-3 py-1 text-xs font-medium text-muted-foreground", mode === m && "bg-card text-foreground shadow-sm")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
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
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadPdf(projectId, fileName.trim() || name);
                toast.success("PDF descargado");
              } catch (err) {
                toast.error("No se ha podido generar el PDF", { description: (err as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Descargar PDF
          </Button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-canvas text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            {mode === "pdf" ? "Generando el PDF con Chromium…" : "Cargando vista…"}
          </div>
        )}
        <iframe key={src} src={src} title="Vista previa" className="size-full border-0" onLoad={() => setLoading(false)} />
      </div>
    </div>
  );
}
