"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileArchive, Loader2, Upload, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { ImportTask } from "@/hooks/use-comic-import";

export const ACCEPT = ".cbr,.cbz,.rar,.zip,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export function ImportDropzone({
  onFiles,
  compact,
  className,
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-input bg-card text-center transition-colors",
        compact ? "px-3 py-5" : "px-6 py-10",
        over && "border-primary bg-secondary",
        className,
      )}
    >
      <div className={cn("flex items-center justify-center rounded-full bg-secondary text-primary", compact ? "size-9" : "size-14")}>
        <Upload className={compact ? "size-4" : "size-6"} />
      </div>
      <div className="space-y-1">
        <p className={cn("font-semibold", compact && "text-sm")}>Arrastra aquí tus cómics</p>
        <p className="text-xs text-muted-foreground">CBR, CBZ o imágenes JPG, PNG y WebP</p>
      </div>
      <Button size={compact ? "sm" : "default"} onClick={() => input.current?.click()}>
        <FileArchive /> Seleccionar archivos
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        data-testid="comic-file-input"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function ImportTasks({ tasks, onDismiss }: { tasks: ImportTask[]; onDismiss: (key: string) => void }) {
  if (tasks.length === 0) return null;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.key} className="rounded-lg border bg-card p-3 shadow-xs">
          <div className="flex items-center gap-2">
            {t.phase === "done" ? (
              <CheckCircle2 className="size-4 text-success" />
            ) : t.phase === "error" ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <Loader2 className="size-4 animate-spin text-primary" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={t.name}>
              {t.name}
            </span>
            {(t.phase === "done" || t.phase === "error") && (
              <button className="rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={() => onDismiss(t.key)} aria-label="Descartar">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {(t.phase === "uploading" || t.phase === "processing") && <Progress value={t.progress} className="mt-2" />}
          <p className={cn("mt-1 text-xs", t.phase === "error" ? "text-destructive" : "text-muted-foreground")}>{t.message}</p>
        </li>
      ))}
    </ul>
  );
}
