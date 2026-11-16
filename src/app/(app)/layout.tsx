import { AppHeader } from "@/components/layout/app-header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="app-backdrop" aria-hidden />
      <AppHeader />
      {/* La barra flota (fixed): se reserva su altura y su margen superior. */}
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-12 sm:px-6">{children}</main>
    </div>
  );
}
