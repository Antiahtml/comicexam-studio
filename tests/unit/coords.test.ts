import { describe, expect, it } from "vitest";
import {
  clampRect,
  clientToNormalized,
  cropAspect,
  isValidRect,
  moveRect,
  normalizedToClient,
  normalizedToPixels,
  pixelsToNormalized,
  rectFromPoints,
  resizeRect,
} from "@/lib/regions/coords";

describe("conversión de coordenadas de selección", () => {
  it("convierte puntos de pantalla a coordenadas normalizadas independientemente del zoom", () => {
    // Misma posición relativa de la imagen mostrada a 100 % y a 250 %
    const at100 = clientToNormalized(150, 300, { left: 100, top: 200, width: 400, height: 600 });
    const at250 = clientToNormalized(100 + 50 * 2.5, 200 + 100 * 2.5, { left: 100, top: 200, width: 1000, height: 1500 });
    expect(at100.x).toBeCloseTo(0.125);
    expect(at100.y).toBeCloseTo(1 / 6);
    expect(at250.x).toBeCloseTo(at100.x);
    expect(at250.y).toBeCloseTo(at100.y);
  });

  it("limita los puntos a los bordes de la imagen", () => {
    expect(clientToNormalized(-50, 9999, { left: 0, top: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 1 });
  });

  it("crea rectángulos arrastrando en cualquier dirección", () => {
    const r = rectFromPoints({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.1 });
    expect(r.x).toBeCloseTo(0.2);
    expect(r.y).toBeCloseTo(0.1);
    expect(r.w).toBeCloseTo(0.4);
    expect(r.h).toBeCloseTo(0.6);
  });

  it("es reversible: normalizado → pantalla → normalizado", () => {
    const box = { left: 37, top: 12, width: 812, height: 1218 };
    const rect = { x: 0.1, y: 0.25, w: 0.5, h: 0.3 };
    const c = normalizedToClient(rect, box);
    const a = clientToNormalized(c.left, c.top, box);
    const b = clientToNormalized(c.left + c.width, c.top + c.height, box);
    const back = rectFromPoints(a, b);
    expect(back.x).toBeCloseTo(rect.x);
    expect(back.y).toBeCloseTo(rect.y);
    expect(back.w).toBeCloseTo(rect.w);
    expect(back.h).toBeCloseTo(rect.h);
  });

  it("convierte a píxeles de la imagen ORIGINAL sin perder píxeles de la viñeta", () => {
    const px = normalizedToPixels({ x: 0.1, y: 0.2, w: 0.3333, h: 0.5 }, 3000, 4500);
    expect(px).toEqual({ left: 300, top: 900, width: 1000, height: 2250 });
    // redondeo hacia fuera
    const px2 = normalizedToPixels({ x: 0.10001, y: 0, w: 0.2, h: 1 }, 1000, 1500);
    expect(px2.left).toBe(100);
    expect(px2.left + px2.width).toBeGreaterThanOrEqual(301);
  });

  it("nunca se sale de la imagen al convertir a píxeles", () => {
    const px = normalizedToPixels({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 1000, 1000);
    expect(px.left + px.width).toBeLessThanOrEqual(1000);
    expect(px.top + px.height).toBeLessThanOrEqual(1000);
  });

  it("píxeles → normalizado → píxeles devuelve la misma caja", () => {
    const box = { left: 123, top: 456, width: 789, height: 321 };
    expect(normalizedToPixels(pixelsToNormalized(box, 2000, 3000), 2000, 3000)).toEqual(box);
  });

  it("mueve sin salirse de la imagen", () => {
    expect(moveRect({ x: 0.7, y: 0.7, w: 0.2, h: 0.2 }, 0.5, 0.5)).toEqual({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
    expect(moveRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, -1, -1)).toEqual({ x: 0, y: 0, w: 0.2, h: 0.2 });
  });

  it("redimensiona desde esquinas y lados respetando el tamaño mínimo", () => {
    const r = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    const se = resizeRect(r, "se", 0.1, 0.1);
    expect(se.w).toBeCloseTo(0.5);
    expect(se.h).toBeCloseTo(0.5);
    const nw = resizeRect(r, "nw", 0.1, 0.1);
    expect(nw.x).toBeCloseTo(0.3);
    expect(nw.w).toBeCloseTo(0.3);
    const collapsed = resizeRect(r, "e", -1, 0);
    expect(collapsed.w).toBeCloseTo(0.01);
    expect(resizeRect(r, "w", -1, 0).x).toBe(0);
  });

  it("valida y corrige rectángulos", () => {
    expect(isValidRect({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isValidRect({ x: 0.5, y: 0, w: 0.6, h: 1 })).toBe(false);
    expect(isValidRect({ x: NaN, y: 0, w: 1, h: 1 })).toBe(false);
    const c = clampRect({ x: 0.95, y: -0.1, w: 0.2, h: 0.5 });
    expect(isValidRect(c)).toBe(true);
  });

  it("calcula la relación de aspecto real del recorte", () => {
    expect(cropAspect({ x: 0, y: 0, w: 0.5, h: 0.25 }, 1000, 1500)).toBeCloseTo(500 / 375);
  });
});
