/**
 * Renderizado del CONTENIDO de cada elemento del examen.
 *
 * Estos componentes son puros (sin estado) y se usan tanto en el editor como en la
 * vista de impresión que convierte Chromium a PDF, de modo que ambos coinciden.
 * Medidas: mm para cajas y espaciados, pt para tipografía y grosores.
 */
import type { CSSProperties, ReactNode } from "react";
import type {
  BorderStyle,
  BoxElement,
  ExamDocument,
  ExamElement,
  ExamHeaderElement,
  FontId,
  ImageElement,
  ImageSource,
  LinesElement,
  QuestionElement,
  ShapeElement,
  TableElement,
  TextElement,
} from "@/lib/document/types";
import { fontCss } from "@/lib/document/fonts";
import { matchOrder } from "@/lib/document/match";
import { sourceUrl } from "@/lib/images/urls";
import { SafeImage } from "./safe-image";

export type RenderQuality = "screen" | "print" | "thumb";

export interface RenderContext {
  doc: ExamDocument;
  numbers: Map<string, string>;
  quality: RenderQuality;
}

const mm = (v: number) => `${v}mm`;
const pt = (v: number) => `${v}pt`;

export function borderCss(b: BorderStyle): CSSProperties {
  if (!b || b.width <= 0) return { borderRadius: b ? mm(b.radius) : undefined };
  return { border: `${pt(b.width)} ${b.style} ${b.color}`, borderRadius: mm(b.radius) };
}

function fontOf(id: FontId | "inherit", ctx: RenderContext) {
  return fontCss(id, ctx.doc.settings.fontFamily);
}

/* ------------------------------- Texto ------------------------------- */

function TextContent({ el, ctx }: { el: TextElement; ctx: RenderContext }) {
  const s = el.style;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: mm(s.padding),
        fontFamily: fontOf(s.fontFamily, ctx),
        fontSize: pt(s.fontSize),
        fontWeight: s.bold ? 700 : 400,
        fontStyle: s.italic ? "italic" : "normal",
        textDecoration: s.underline ? "underline" : "none",
        textAlign: s.align,
        lineHeight: s.lineHeight,
        color: s.color,
        background: s.background ?? "transparent",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        overflow: "hidden",
        ...borderCss(el.border),
      }}
    >
      {el.text}
    </div>
  );
}

/* ------------------------------- Imagen ------------------------------- */

function SourceImage({ src, quality, fit, style }: { src: ImageSource; quality: RenderQuality; fit: string; style?: CSSProperties }) {
  return (
    <SafeImage
      src={sourceUrl(src, quality)}
      alt={src.label}
      style={{ display: "block", width: "100%", height: "100%", objectFit: fit as CSSProperties["objectFit"], userSelect: "none", ...style }}
    />
  );
}

function ImageContent({ el, ctx }: { el: ImageElement; ctx: RenderContext }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", opacity: el.opacity }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", boxSizing: "border-box", background: "#fff", ...borderCss(el.border) }}>
        <SourceImage src={el.src} quality={ctx.quality} fit={el.fit} />
      </div>
      {el.caption && (
        <div style={{ fontSize: pt(9), fontStyle: "italic", color: "#374151", textAlign: "center", paddingTop: mm(1), fontFamily: fontOf("inherit", ctx) }}>{el.caption}</div>
      )}
    </div>
  );
}

/* ------------------------------- Pregunta ------------------------------- */

function AnswerLines({ count, spacing, style, color = "#6b7280", thickness = 0.6 }: { count: number; spacing: number; style: string; color?: string; thickness?: number }) {
  return (
    <div style={{ width: "100%" }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ height: mm(spacing), borderBottom: `${pt(thickness)} ${style} ${color}`, boxSizing: "border-box" }} />
      ))}
    </div>
  );
}

/**
 * Línies que omplen tot l'espai que queda a la caixa: se'n dibuixen de sobra i el contenidor (amb
 * `overflow: hidden`) retalla les que no hi caben. Així, en allargar o escurçar la caixa, apareixen
 * o desapareixen línies soles, sense estat ni mesures: serveix igual al navegador i al PDF.
 */
const FILL_LINE_ROWS = 70;
function FillLines({ spacing, style, color = "#6b7280", thickness = 0.6 }: { spacing: number; style: string; color?: string; thickness?: number }) {
  return (
    <div style={{ flex: "1 1 0", minHeight: 0, width: "100%", overflow: "hidden" }} data-fill-lines>
      {Array.from({ length: FILL_LINE_ROWS }, (_, i) => (
        <div key={i} style={{ height: mm(spacing), borderBottom: `${pt(thickness)} ${style} ${color}`, boxSizing: "border-box" }} />
      ))}
    </div>
  );
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function QuestionContent({ el, ctx }: { el: QuestionElement; ctx: RenderContext }) {
  const number = ctx.numbers.get(el.id) ?? "?";
  const showPoints = ctx.doc.settings.showPoints && el.points !== null && el.points > 0;
  const fs = el.fontSize;
  // Respuesta larga e imagen: las líneas llenan la caja (ver FillLines).
  const fill = (el.kind === "long" || el.kind === "image") && el.autoLines === true;
  let body: ReactNode = null;
  switch (el.kind) {
    case "short":
    case "long":
      body = fill ? <FillLines spacing={el.lineSpacing} style={el.lineStyle} /> : <AnswerLines count={el.lines} spacing={el.lineSpacing} style={el.lineStyle} />;
      break;
    case "image":
      body = (
        <>
          {el.image ? (
            <div style={{ height: mm(el.imageHeight), marginBottom: mm(2), display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <SourceImage src={el.image} quality={ctx.quality} fit="contain" style={{ width: "auto", maxWidth: "100%", border: "0.75pt solid #111827" }} />
            </div>
          ) : (
            <div
              style={{
                height: mm(el.imageHeight),
                marginBottom: mm(2),
                flexShrink: 0,
                border: "0.75pt dashed #9ca3af",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: pt(9),
              }}
            >
              Arrossega aquí una vinyeta o tria-la al panell de propietats
            </div>
          )}
          {fill ? <FillLines spacing={el.lineSpacing} style={el.lineStyle} /> : <AnswerLines count={el.lines} spacing={el.lineSpacing} style={el.lineStyle} />}
        </>
      );
      break;
    case "multiple":
      body = (
        <div
          style={
            el.optionColumns >= 1
              ? { display: "grid", gridTemplateColumns: `repeat(${el.optionColumns}, minmax(0, 1fr))`, columnGap: mm(8), rowGap: mm(2), paddingTop: mm(1) }
              : // Automático: todas en una fila, bien repartidas; si no caben, pasan a más filas.
                { display: "flex", flexWrap: "wrap", columnGap: mm(8), rowGap: mm(2), paddingTop: mm(1) }
          }
        >
          {el.options.map((o, i) => (
            <div key={i} style={el.optionColumns >= 1 ? undefined : { flex: "1 0 auto", maxWidth: "100%" }}>
              <span style={{ whiteSpace: "pre-wrap" }}>
                <strong>{LETTERS[i]})</strong> {o}
              </span>
            </div>
          ))}
        </div>
      );
      break;
    case "truefalse":
      body = (
        <div style={{ display: "flex", flexDirection: "column", gap: mm(1.6), paddingTop: mm(1) }}>
          {el.statements.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: mm(3) }}>
              <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>
                {LETTERS[i]}) {s}
              </span>
              {["V", "F"].map((l) => (
                <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: mm(1), fontSize: pt(fs * 0.85), fontWeight: 600 }}>
                  {l}
                  <span style={{ width: mm(4.5), height: mm(4.5), border: "0.9pt solid #374151", boxSizing: "border-box", display: "inline-block" }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      );
      break;
    case "match":
      body = (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: mm(18), rowGap: mm(2.5), paddingTop: mm(1.5) }}>
          {/* La columna B se baraja sola (llavor guardada): el docent escriu les parelles correctes. */}
          {matchOrder(el.pairs.length, el.shuffleSeed).map((pairIndex, i) => (
            <div key={`l${i}`} style={{ display: "contents" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: mm(2) }}>
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {i + 1}. {el.pairs[i].left}
                </span>
                <span style={{ width: mm(2), height: mm(2), borderRadius: "50%", background: "#111827", flexShrink: 0 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: mm(2) }}>
                <span style={{ width: mm(2), height: mm(2), borderRadius: "50%", background: "#111827", flexShrink: 0 }} />
                <span style={{ whiteSpace: "pre-wrap" }}>
                  {LETTERS[i]}) {el.pairs[pairIndex].right}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
      break;
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        fontFamily: fontOf(el.fontFamily, ctx),
        fontSize: pt(fs),
        lineHeight: 1.35,
        color: el.color,
        padding: el.border.width > 0 ? mm(2) : 0,
        ...(fill ? { display: "flex", flexDirection: "column" as const } : null),
        ...borderCss(el.border),
      }}
    >
      <div style={{ display: "flex", gap: mm(1.5), alignItems: "baseline", marginBottom: mm(1.5), flexShrink: 0 }}>
        <strong style={{ flexShrink: 0 }}>{number}.</strong>
        <span style={{ flex: 1, whiteSpace: "pre-wrap", fontWeight: 600 }}>{el.prompt}</span>
        {showPoints && (
          <span style={{ flexShrink: 0, fontSize: pt(fs * 0.85), color: "#4b5563", whiteSpace: "nowrap" }}>
            ({formatPoints(el.points!)})
          </span>
        )}
      </div>
      {body}
    </div>
  );
}

export function formatPoints(p: number): string {
  const n = Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0+$/, "").replace(".", ",");
  return `${n} ${p === 1 ? "punt" : "punts"}`;
}

/* ------------------------------- Respuestas ------------------------------- */

function LinesContent({ el }: { el: LinesElement }) {
  return <AnswerLines count={el.count} spacing={el.spacing} style={el.lineStyle} color={el.color} thickness={el.thickness} />;
}

function BoxContent({ el, ctx }: { el: BoxElement; ctx: RenderContext }) {
  const grid =
    el.grid > 0
      ? {
          backgroundImage: `linear-gradient(to right, #d1d5db 0.4pt, transparent 0.4pt), linear-gradient(to bottom, #d1d5db 0.4pt, transparent 0.4pt)`,
          backgroundSize: `${mm(el.grid)} ${mm(el.grid)}`,
        }
      : {};
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        backgroundColor: el.background ?? "transparent",
        ...grid,
        ...borderCss(el.border),
        position: "relative",
      }}
    >
      {el.label && (
        <span style={{ position: "absolute", top: mm(1.5), left: mm(2), fontSize: pt(9), color: "#4b5563", fontFamily: fontOf("inherit", ctx), fontWeight: 600 }}>
          {el.label}
        </span>
      )}
    </div>
  );
}

function TableContent({ el, ctx }: { el: TableElement; ctx: RenderContext }) {
  const rows = Array.from({ length: el.rows }, (_, r) => Array.from({ length: el.cols }, (_, c) => el.cells[r]?.[c] ?? ""));
  return (
    <table
      style={{
        width: "100%",
        height: "100%",
        borderCollapse: "collapse",
        tableLayout: "fixed",
        fontFamily: fontOf("inherit", ctx),
        fontSize: pt(el.fontSize),
      }}
    >
      <tbody>
        {rows.map((row, r) => (
          <tr key={r} style={{ height: `${100 / el.rows}%` }}>
            {row.map((cell, c) => {
              const header = el.headerRow && r === 0;
              return (
                <td
                  key={c}
                  style={{
                    border: `0.75pt solid ${el.borderColor}`,
                    padding: `${mm(0.8)} ${mm(1.5)}`,
                    verticalAlign: "top",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontWeight: header ? 700 : 400,
                    background: header ? "#f3f4f6" : "transparent",
                  }}
                >
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ShapeContent({ el, ctx }: { el: ShapeElement; ctx: RenderContext }) {
  const stroke = `${pt(el.strokeWidth)} ${el.dash} ${el.stroke}`;
  switch (el.shape) {
    case "rect":
    case "ellipse":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            border: el.strokeWidth > 0 ? stroke : "none",
            background: el.fill ?? "transparent",
            borderRadius: el.shape === "ellipse" ? "50%" : mm(el.radius),
          }}
        />
      );
    case "hline":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
          <div style={{ width: "100%", borderTop: stroke }} />
        </div>
      );
    case "vline":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center" }}>
          <div style={{ height: "100%", borderLeft: stroke }} />
        </div>
      );
    case "divider":
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: mm(3) }}>
          {el.title && (
            <span
              style={{
                fontFamily: fontOf("inherit", ctx),
                fontWeight: 700,
                fontSize: pt(12),
                color: el.stroke,
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {el.title}
            </span>
          )}
          <div style={{ flex: 1, borderTop: stroke }} />
        </div>
      );
  }
}

/* ------------------------------- Cabecera ------------------------------- */

function ExamHeaderContent({ el, ctx }: { el: ExamHeaderElement; ctx: RenderContext }) {
  const m = ctx.doc.meta;
  const boxed = el.variant === "boxed";
  const subtitle = [m.subject, el.showCourse ? m.course : "", el.showDate ? m.date : ""].filter(Boolean).join("  ·  ");
  const line = { flex: 1, borderBottom: "0.75pt solid #374151", minWidth: mm(20) } as CSSProperties;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        fontFamily: fontOf("inherit", ctx),
        fontSize: pt(10.5),
        color: "#111827",
        padding: boxed ? `${mm(3)} ${mm(4)}` : `0 0 ${mm(2)} 0`,
        border: boxed ? "1pt solid #111827" : "none",
        borderBottom: boxed ? "1pt solid #111827" : "1.5pt solid #111827",
        borderRadius: boxed ? mm(2) : 0,
        display: "flex",
        flexDirection: "column",
        gap: mm(2),
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: mm(4) }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: pt(16), fontWeight: 800, lineHeight: 1.15 }}>{m.title || "Examen"}</div>
          {subtitle && <div style={{ fontSize: pt(10), color: "#4b5563", marginTop: mm(1) }}>{subtitle}</div>}
        </div>
        {el.showScore && (
          <div style={{ border: "1pt solid #111827", borderRadius: mm(1.5), padding: `${mm(1.5)} ${mm(3)}`, textAlign: "center", flexShrink: 0 }}>
            <div style={{ fontSize: pt(8), textTransform: "uppercase", letterSpacing: "0.06em", color: "#4b5563" }}>Nota</div>
            {/* Casilla vacía para escribir la nota a mano. */}
            <div style={{ width: mm(20), height: mm(8) }} />
          </div>
        )}
      </div>
      {el.showName && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: mm(2) }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Nom i cognoms:</span>
          <span style={line} />
          {el.showCourse && (
            <>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap", marginLeft: mm(2) }}>Grup:</span>
              <span style={{ ...line, flex: "0 0 22mm" }} />
            </>
          )}
        </div>
      )}
      {el.showInstructions && m.instructions && (
        <div style={{ fontSize: pt(9.5), color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
          <strong>Instruccions: </strong>
          {m.instructions}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Despachador ------------------------------- */

export function ElementContent({ el, ctx }: { el: ExamElement; ctx: RenderContext }) {
  switch (el.type) {
    case "text":
      return <TextContent el={el} ctx={ctx} />;
    case "image":
      return <ImageContent el={el} ctx={ctx} />;
    case "question":
      return <QuestionContent el={el} ctx={ctx} />;
    case "lines":
      return <LinesContent el={el} />;
    case "box":
      return <BoxContent el={el} ctx={ctx} />;
    case "table":
      return <TableContent el={el} ctx={ctx} />;
    case "shape":
      return <ShapeContent el={el} ctx={ctx} />;
    case "examHeader":
      return <ExamHeaderContent el={el} ctx={ctx} />;
  }
}

/** Estilo de posicionamiento absoluto de un elemento en la hoja (mm). */
export function elementBoxStyle(el: ExamElement): CSSProperties {
  return {
    position: "absolute",
    left: mm(el.x),
    top: mm(el.y),
    width: mm(el.w),
    height: mm(el.h),
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: "center center",
  };
}
