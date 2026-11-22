import { isUuid } from "@/lib/normalize";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!row) notFound();
  return <><PageHead title={`Edit: ${row.title}`} crumbs={[{ href: "/tasks", label: "Tasks & Follow-ups" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="tasks" id={id} values={row} back={"/tasks"} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "tasks", id)} back="/tasks" /></Card></div></>;
}
