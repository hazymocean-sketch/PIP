import { isUuid } from "@/lib/normalize";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { opportunities } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [row] = await db.select().from(opportunities).where(eq(opportunities.id, id));
  if (!row) notFound();
  return <><PageHead title={`Edit: ${row.title}`} crumbs={[{ href: "/opportunities", label: "CRM" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="opportunities" id={id} values={row} back={`/opportunities/${id}`} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "opportunities", id)} back="/opportunities" /></Card></div></>;
}
