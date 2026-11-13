import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PrintPreview } from "@/components/editor/print-preview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vista previa · ComicExam Studio" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) notFound();
  return <PrintPreview projectId={project.id} name={project.name} />;
}
