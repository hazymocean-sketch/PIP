import { isUuid } from "@/lib/normalize";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export const metadata = { title: "Meeting" };
export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [row] = await db.select().from(meetings).where(eq(meetings.id, id));
  if (!row) notFound();
  const day = new Date(row.startsAt.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
  const back = `/agenda?view=day&d=${day}`;
  return <><PageHead title={row.title} crumbs={[{ href: "/agenda", label: "Agenda" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="meetings" id={id} values={row} back={back} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "meetings", id)} back={back} /></Card></div></>;
}
