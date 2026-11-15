import Link from "next/link";
import { LogoMark } from "./logo";

export function NotFoundView({ what = "El examen o cómic" }: { what?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="text-2xl font-bold">No encontrado</h1>
      <p className="max-w-md text-muted-foreground">
        {what} no existe en este navegador. Recuerda que los datos se guardan en cada navegador por separado: si lo creaste en otro
        equipo, expórtalo allí como .comicexam e impórtalo aquí.
      </p>
      <Link href="/" className="text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
