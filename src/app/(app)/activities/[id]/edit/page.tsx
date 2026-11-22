import { isUuid } from "@/lib/normalize";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [row] = await db.select().from(activities).where(eq(activities.id, id));
  if (!row) notFound();
  return <><PageHead title={`Edit: ${row.subject}`} crumbs={[{ href: "/activities", label: "Meetings & Activities" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="activities" id={id} values={row} back={"/activities"} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "activities", id)} back="/activities" /></Card></div></>;
}
