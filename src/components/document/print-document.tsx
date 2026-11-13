"use client";

import { useEffect, useMemo } from "react";
import type { ExamDocument } from "@/lib/document/types";
import { questionNumbers } from "@/lib/document/geometry";
import { pageSize } from "@/lib/document/units";
import { PageSurface } from "./page-surface";

declare global {
  interface Window {
    __PRINT_READY__?: boolean;
    __PRINT_ERRORS__?: number;
  }
}

/** Documento listo para imprimir. Marca window.__PRINT_READY__ cuando fuentes e imágenes han cargado. */
export function PrintDocument({ doc }: { doc: ExamDocument }) {
  const numbers = useMemo(() => questionNumbers(doc), [doc]);
  const { width, height } = pageSize(doc.settings.orientation);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-print-image]"));
      let errors = 0;
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) {
                if (img.naturalWidth === 0) errors++;
                return resolve();
              }
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener(
                "error",
                () => {
                  errors++;
                  resolve();
                },
                { once: true },
              );
            }),
        ),
      );
      await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
      if (!cancelled) {
        window.__PRINT_ERRORS__ = errors;
        window.__PRINT_READY__ = true;
        document.body.dataset.printReady = "true";
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <style>{`
        @page { size: ${width}mm ${height}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-page { break-after: page; page-break-after: always; overflow: hidden; }
        .print-page:last-child { break-after: auto; page-break-after: auto; }
        @media screen {
          html, body { background: #e7e9f0; }
          .print-root { display: flex; flex-direction: column; align-items: center; gap: 8mm; padding: 8mm 0; }
          .print-page { box-shadow: 0 4px 24px rgba(15,23,42,.18); }
        }
      `}</style>
      <div className="print-root">
        {doc.pages.map((page, i) => (
          <PageSurface key={page.id} doc={doc} page={page} pageIndex={i} ctx={{ doc, numbers, quality: "print" }} className="print-page" />
        ))}
      </div>
    </>
  );
}
