import type { Metadata } from "next";
import { LibraryView } from "@/components/comics/library-view";

export const metadata: Metadata = { title: "Biblioteca de cómics · ComicExam Studio" };

export default function BibliotecaPage() {
  return <LibraryView />;
}
