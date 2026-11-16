import type { Metadata } from "next";
import "./fonts";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "@/components/layout/providers";
import { AppBoot } from "@/components/layout/app-boot";
import { BASE_PATH } from "@/lib/env";
import { themeInitScript } from "@/components/layout/theme";

export const metadata: Metadata = {
  title: "ComicExam Studio",
  description: "Crea exámenes imprimibles a partir de cómics digitales.",
  icons: { icon: `${BASE_PATH}/logo.svg` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <AppBoot>{children}</AppBoot>
        </Providers>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
