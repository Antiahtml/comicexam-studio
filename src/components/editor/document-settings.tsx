"use client";

import { RectangleHorizontal, RectangleVertical, PanelTop } from "lucide-react";
import { useEditor } from "@/store/editor-store";
import { Button } from "@/components/ui/button";
import { Field, NumberField, Section, Segmented, SwitchRow, TextField } from "./fields";
import { FONTS } from "@/lib/document/fonts";
import { totalPoints } from "@/lib/document/geometry";
import { createExamHeader } from "@/lib/document/factory";
import type { FontId, HeaderFooter } from "@/lib/document/types";

/** Configuración del examen (datos) y de la página (formato, márgenes, cabecera, pie, numeración). */
export function DocumentSettings() {
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState();
  const m = doc.meta;
  const s = doc.settings;
  const sum = totalPoints(doc);

  const setMargin = (k: keyof typeof s.margins, v: number) => st.updateSettings({ margins: { ...s.margins, [k]: v } }, `margin-${k}`);
  const setHF = (which: "header" | "footer", patch: Partial<HeaderFooter>, key: string) =>
    st.updateSettings({ [which]: { ...s[which], ...patch } } as never, `${which}-${key}`);

  return (
    <div data-testid="document-settings">
      <div className="material sticky top-0 z-10 px-4 py-3 shadow-[0_1px_0_var(--material-edge)]">
        <h2 className="text-sm font-semibold">Documento</h2>
      </div>
      <Section title="Datos del examen">
        <Field label="Título">
          <TextField value={m.title} onChange={(v) => st.updateMeta({ title: v }, "title")} testId="meta-title" />
        </Field>
        <Field label="Asignatura">
          <TextField value={m.subject} onChange={(v) => st.updateMeta({ subject: v }, "subject")} placeholder="Lengua castellana" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Curso o grupo">
            <TextField value={m.course} onChange={(v) => st.updateMeta({ course: v }, "course")} placeholder="2.º ESO B" />
          </Field>
          <Field label="Fecha">
            <TextField value={m.date} onChange={(v) => st.updateMeta({ date: v }, "date")} />
          </Field>
        </div>
        <NumberField label="Puntuación total" value={m.totalScore ?? 0} min={0} step={0.5} onChange={(v) => st.updateMeta({ totalScore: v }, "score")} />
        <p className="text-2xs text-muted-foreground">
          Suma de las preguntas: <strong>{sum}</strong>{" "}
          {sum > 0 && sum !== m.totalScore && (
            <button className="text-primary hover:underline" onClick={() => st.updateMeta({ totalScore: sum })}>
              Usar esta suma
            </button>
          )}
        </p>
        <Field label="Instrucciones generales">
          <TextField multiline value={m.instructions} onChange={(v) => st.updateMeta({ instructions: v }, "instructions")} />
        </Field>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => st.addElement(createExamHeader())}
          title="Bloque con título, nombre del alumno, nota e instrucciones"
        >
          <PanelTop /> Insertar cabecera del examen
        </Button>
      </Section>

      <Section title="Página">
        <Segmented
          value={s.orientation}
          onChange={(v) => st.updateSettings({ orientation: v })}
          options={[
            { value: "portrait", label: <><RectangleVertical /> A4 vertical</> },
            { value: "landscape", label: <><RectangleHorizontal /> A4 horizontal</> },
          ]}
        />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-2xs font-medium text-muted-foreground">Márgenes (mm)</span>
            <div className="flex gap-1">
              {[
                ["Estrechos", 10],
                ["Normales", 15],
                ["Amplios", 25],
              ].map(([label, v]) => (
                <button
                  key={label}
                  className="rounded px-1.5 py-0.5 text-2xs text-primary hover:bg-secondary"
                  onClick={() => st.updateSettings({ margins: { top: v as number, right: v as number, bottom: v as number, left: v as number } })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <NumberField label="Arriba" value={s.margins.top} min={0} max={80} onChange={(v) => setMargin("top", v)} />
            <NumberField label="Abajo" value={s.margins.bottom} min={0} max={80} onChange={(v) => setMargin("bottom", v)} />
            <NumberField label="Izq." value={s.margins.left} min={0} max={80} onChange={(v) => setMargin("left", v)} />
            <NumberField label="Der." value={s.margins.right} min={0} max={80} onChange={(v) => setMargin("right", v)} />
          </div>
        </div>
        <Field label="Fuente principal">
          <select
            className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
            value={s.fontFamily}
            onChange={(e) => st.updateSettings({ fontFamily: e.target.value as FontId })}
          >
            {Object.entries(FONTS).map(([id, f]) => (
              <option key={id} value={id} style={{ fontFamily: f.css }}>
                {f.label} · {f.group}
              </option>
            ))}
          </select>
        </Field>
        <SwitchRow label="Mostrar puntuación de cada pregunta" checked={s.showPoints} onChange={(v) => st.updateSettings({ showPoints: v })} />
      </Section>

      <Section title="Numeración de páginas">
        <SwitchRow label="Numerar páginas" checked={s.showPageNumbers} onChange={(v) => st.updateSettings({ showPageNumbers: v })} />
        {s.showPageNumbers && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Formato">
              <select
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
                value={s.pageNumberFormat}
                onChange={(e) => st.updateSettings({ pageNumberFormat: e.target.value as typeof s.pageNumberFormat })}
              >
                <option value="n">1</option>
                <option value="n-total">1 / 3</option>
                <option value="pagina-n-de-total">Página 1 de 3</option>
              </select>
            </Field>
            <Field label="Posición">
              <select
                className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
                value={s.pageNumberPosition}
                onChange={(e) => st.updateSettings({ pageNumberPosition: e.target.value as typeof s.pageNumberPosition })}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </select>
            </Field>
          </div>
        )}
      </Section>

      {(["header", "footer"] as const).map((which) => (
        <Section key={which} title={which === "header" ? "Encabezado" : "Pie de página"}>
          <SwitchRow
            label={which === "header" ? "Mostrar encabezado" : "Mostrar pie de página"}
            checked={s[which].enabled}
            onChange={(v) => setHF(which, { enabled: v }, "enabled")}
          />
          {s[which].enabled && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                {(["left", "center", "right"] as const).map((pos) => (
                  <Field key={pos} label={pos === "left" ? "Izquierda" : pos === "center" ? "Centro" : "Derecha"}>
                    <TextField value={s[which][pos]} onChange={(v) => setHF(which, { [pos]: v }, pos)} />
                  </Field>
                ))}
              </div>
              <p className="text-2xs leading-snug text-muted-foreground">
                Variables: {"{titulo}"} {"{asignatura}"} {"{curso}"} {"{fecha}"} {"{pagina}"} {"{total}"}
              </p>
            </>
          )}
        </Section>
      ))}
    </div>
  );
}
