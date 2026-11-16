import Link from "next/link";
import { LogoMark } from "./logo";

export function NotFoundView({ what = "L'examen o el còmic" }: { what?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="text-2xl font-bold">No trobat</h1>
      <p className="max-w-md text-muted-foreground">
        {what} no existeix en aquest navegador. Recorda que les dades es desen a cada navegador per separat: si el vas crear en un altre
        equip, exporta’l allà com a .comicexam i importa’l aquí.
      </p>
      <Link href="/" className="text-primary hover:underline">
        Torna a l’inici
      </Link>
    </div>
  );
}
