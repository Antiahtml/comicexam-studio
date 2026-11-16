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
  description: "Crea exàmens imprimibles a partir de còmics digitals.",
  icons: { icon: `${BASE_PATH}/logo.svg` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ca" suppressHydrationWarning>
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
