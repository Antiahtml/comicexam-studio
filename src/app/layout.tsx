import type { Metadata } from "next";
import "./fonts";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/layout/providers";

export const metadata: Metadata = {
  title: "ComicExam Studio",
  description: "Crea exámenes imprimibles a partir de cómics digitales.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
