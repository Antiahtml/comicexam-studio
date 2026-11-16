"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Imagen de un elemento del examen. Si no se puede cargar (p. ej. se eliminó el cómic de origen),
 * muestra un aviso en lugar del icono de imagen rota. El aviso se marca con data-missing-image
 * para que la revisión previa a la exportación lo detecte.
 */
export function SafeImage({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  // Si la carga falló antes de que React se activara (HTML del servidor), no llega onError.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(img.getAttribute("src"));
  }, [src]);
  if (failedSrc === src) {
    return (
      <div
        data-missing-image
        style={{
          width: "100%",
          height: "100%",
          minHeight: "12mm",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1mm",
          padding: "2mm",
          boxSizing: "border-box",
          border: "0.75pt dashed #dc2626",
          background: "#fef2f2",
          color: "#991b1b",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <strong style={{ fontSize: "9pt" }}>Imatge no disponible</strong>
        <span style={{ fontSize: "7.5pt" }}>S’ha eliminat el còmic d’origen: {alt}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt={alt} draggable={false} data-print-image onError={() => setFailedSrc(src)} style={style} />
  );
}
