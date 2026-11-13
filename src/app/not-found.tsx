import Link from "next/link";
import { LogoMark } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="text-2xl font-bold">No encontrado</h1>
      <p className="text-muted-foreground">El examen o cómic que buscas no existe o se ha eliminado.</p>
      <Link href="/" className="text-primary hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}
