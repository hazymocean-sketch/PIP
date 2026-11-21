import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export default async function EditProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [p] = await db.select().from(projects).where(eq(projects.id, id));
  if (!p) notFound();
  return <><PageHead title={`Edit: ${p.name}`} crumbs={[{ href: "/projects", label: "Projects" }, { href: `/projects/${id}`, label: p.name }]} />
    <Flash sp={sp} /><EntityForm entity="projects" id={id} values={p} /></>;
}
