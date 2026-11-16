import type { CSSProperties, ReactNode } from "react";
import type { ExamDocument, ExamElement, ExamPage, HeaderFooter } from "@/lib/document/types";
import { pageSize } from "@/lib/document/units";
import { fontCss } from "@/lib/document/fonts";
import { ElementContent, elementBoxStyle, type RenderContext } from "./element-content";

/** Substitueix les variables de capçalera/peu: {titol}, {assignatura}, {curs}, {data}, {pagina}, {total} (també s'accepten les antigues en castellà). */
export function fillTokens(text: string, doc: ExamDocument, page: number, total: number): string {
  return text
    .replace(/\{(?:titol|titulo)\}/gi, doc.meta.title)
    .replace(/\{(?:assignatura|asignatura)\}/gi, doc.meta.subject)
    .replace(/\{(?:curs|curso)\}/gi, doc.meta.course)
    .replace(/\{(?:data|fecha)\}/gi, doc.meta.date)
    .replace(/\{pagina\}/gi, String(page))
    .replace(/\{total\}/gi, String(total));
}

export function pageNumberText(doc: ExamDocument, page: number, total: number): string {
  switch (doc.settings.pageNumberFormat) {
    case "n":
      return String(page);
    case "n-total":
      return `${page} / ${total}`;
    default:
      return `Pàgina ${page} de ${total}`;
  }
}

function Band({
  hf,
  doc,
  pageNo,
  total,
  top,
  pageNumber,
}: {
  hf: HeaderFooter | null;
  doc: ExamDocument;
  pageNo: number;
  total: number;
  top: number;
  pageNumber: { pos: "left" | "center" | "right"; text: string } | null;
}) {
  const m = doc.settings.margins;
  const slots: Record<"left" | "center" | "right", string> = {
    left: hf?.enabled ? fillTokens(hf.left, doc, pageNo, total) : "",
    center: hf?.enabled ? fillTokens(hf.center, doc, pageNo, total) : "",
    right: hf?.enabled ? fillTokens(hf.right, doc, pageNo, total) : "",
  };
  if (pageNumber) slots[pageNumber.pos] = slots[pageNumber.pos] ? `${slots[pageNumber.pos]}  ·  ${pageNumber.text}` : pageNumber.text;
  if (!slots.left && !slots.center && !slots.right) return null;
  const style: CSSProperties = {
    position: "absolute",
    left: `${m.left}mm`,
    right: `${m.right}mm`,
    top: `${top}mm`,
    transform: "translateY(-50%)",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: "4mm",
    fontSize: "8.5pt",
    color: "#4b5563",
    whiteSpace: "nowrap",
  };
  return (
    <div style={style} data-band>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{slots.left}</span>
      <span style={{ textAlign: "center" }}>{slots.center}</span>
      <span style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{slots.right}</span>
    </div>
  );
}

/**
 * Hoja A4 con sus elementos, cabecera, pie y numeración. `renderElement` permite al editor
 * envolver cada elemento con controles interactivos sin cambiar cómo se dibuja.
 */
export function PageSurface({
  doc,
  page,
  pageIndex,
  ctx,
  renderElement,
  children,
  className,
  style,
}: {
  doc: ExamDocument;
  page: ExamPage;
  pageIndex: number;
  ctx: RenderContext;
  renderElement?: (el: ExamElement, content: ReactNode, index: number) => ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const { width, height } = pageSize(doc.settings.orientation);
  const s = doc.settings;
  const total = doc.pages.length;
  const pageNo = pageIndex + 1;
  const pn = s.showPageNumbers ? { pos: s.pageNumberPosition, text: pageNumberText(doc, pageNo, total) } : null;
  return (
    <div
      className={className}
      data-exam-page={page.id}
      style={{
        position: "relative",
        width: `${width}mm`,
        height: `${height}mm`,
        background: "#ffffff",
        fontFamily: fontCss(s.fontFamily, s.fontFamily),
        color: "#111827",
        ...style,
      }}
    >
      <Band hf={s.header} doc={doc} pageNo={pageNo} total={total} top={s.margins.top / 2} pageNumber={null} />
      {page.elements.map((el, i) => {
        const content = <ElementContent el={el} ctx={ctx} />;
        return renderElement ? (
          renderElement(el, content, i)
        ) : (
          <div key={el.id} style={elementBoxStyle(el)}>
            {content}
          </div>
        );
      })}
      <Band hf={s.footer} doc={doc} pageNo={pageNo} total={total} top={height - s.margins.bottom / 2} pageNumber={pn} />
      {children}
    </div>
  );
}
