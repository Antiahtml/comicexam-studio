import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects/repository";
import { PrintDocument } from "@/components/document/print-document";

export const dynamic = "force-dynamic";

/**
 * Vista de impresión: SOLO el documento, sin controles del editor.
 * La usa Chromium para generar el PDF y la vista previa para mostrarlo.
 */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id).catch(() => null);
  if (!project) notFound();
  return <PrintDocument doc={project.document} />;
}
