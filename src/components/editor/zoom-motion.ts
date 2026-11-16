"use client";

import { useEditor } from "@/store/editor-store";

/**
 * Movimiento del zoom del editor.
 *
 * - El zoom se anima con un muelle críticamente amortiguado (sin rebote, «response» 0,3 s)
 *   en escala logarítmica, para que acercar y alejar se perciban igual de rápidos.
 * - La animación es interrumpible: un nuevo objetivo reorienta el muelle conservando su
 *   velocidad, y la rueda o el pellizco del trackpad la detienen en seco (manipulación directa).
 * - Quien cambie el zoom puede fijar antes un punto de anclaje (coordenadas de pantalla) que el
 *   lienzo mantendrá inmóvil; si no hay anclaje, se usa el centro de la vista.
 */

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

const RESPONSE = 0.3;
const OMEGA = (2 * Math.PI) / RESPONSE;

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/* ------------------------------- Anclaje ------------------------------- */

let anchor: { x: number; y: number } | null = null;

export function setZoomAnchor(point: { x: number; y: number } | null) {
  anchor = point;
}

/** Devuelve (y consume) el anclaje pendiente. */
export function takeZoomAnchor() {
  const a = anchor;
  anchor = null;
  return a;
}

/* ------------------------------- Muelle ------------------------------- */

let raf = 0;
let x = 0; // log(zoom) actual de la animación
let v = 0; // velocidad en log(zoom)/s
let goal = 0; // log(zoom) objetivo
let last = 0;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function step(now: number) {
  const dt = Math.min(0.032, (now - last) / 1000);
  last = now;
  const a = -OMEGA * OMEGA * (x - goal) - 2 * OMEGA * v;
  v += a * dt;
  x += v * dt;
  if (Math.abs(x - goal) < 0.002 && Math.abs(v) < 0.02) {
    raf = 0;
    useEditor.getState().setZoom(Math.exp(goal));
    return;
  }
  useEditor.getState().setZoom(Math.exp(x));
  raf = requestAnimationFrame(step);
}

export function stopZoomAnimation() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  v = 0;
}

/** Anima el zoom hasta `target`, anclado al centro de la vista. */
export function animateZoomTo(target: number) {
  const z = clampZoom(target);
  if (reducedMotion()) {
    stopZoomAnimation();
    useEditor.getState().setZoom(z);
    return;
  }
  goal = Math.log(z);
  if (!raf) {
    x = Math.log(useEditor.getState().zoom);
    v = 0;
    last = performance.now();
    raf = requestAnimationFrame(step);
  }
}

/** Multiplica el zoom partiendo del objetivo en curso (pulsaciones seguidas se acumulan). */
export function zoomBy(factor: number) {
  const base = raf ? Math.exp(goal) : useEditor.getState().zoom;
  animateZoomTo(base * factor);
}
