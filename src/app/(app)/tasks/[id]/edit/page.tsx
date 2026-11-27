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
  const back = sp.back && /^\/(agenda|tasks|projects|opportunities|pipeline)(\/|\?|$)/.test(sp.back) ? sp.back : "/tasks";
  return <><PageHead title={`Edit: ${row.title}`} crumbs={[back.startsWith("/agenda") ? { href: back, label: "Agenda" } : { href: "/tasks", label: "Tasks & Follow-ups" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="tasks" id={id} values={row} back={back} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "tasks", id)} back={back} /></Card></div></>;
}
