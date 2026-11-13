import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects/repository";
import { EditorShell } from "@/components/editor/editor-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProject(id).catch(() => null);
  return { title: p ? `${p.name} · ComicExam Studio` : "Editor · ComicExam Studio" };
}

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id).catch(() => null);
  if (!project) notFound();
  return <EditorShell project={{ id: project.id, name: project.name, document: project.document }} />;
}
