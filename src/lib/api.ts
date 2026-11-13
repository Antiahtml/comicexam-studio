import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Envuelve un manejador para devolver errores legibles en español. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        return jsonError(`Datos no válidos (${issue?.path.join(".") || "?"}): ${issue?.message ?? ""}`, 400);
      }
      if ((err as { code?: string })?.code === "P2025") return jsonError("No se ha encontrado el recurso solicitado.", 404);
      console.error("[api]", err);
      return jsonError(err instanceof Error ? err.message : "Error interno del servidor", 500);
    }
  };
}

export const ID_RE = /^[a-z0-9]{6,40}$/i;
