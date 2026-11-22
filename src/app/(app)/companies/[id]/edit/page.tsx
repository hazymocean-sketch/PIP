import { isUuid } from "@/lib/normalize";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; if (!isUuid(id)) notFound(); const sp = await searchParams;
  const [row] = await db.select().from(companies).where(eq(companies.id, id));
  if (!row) notFound();
  return <><PageHead title={`Edit: ${row.name}`} crumbs={[{ href: "/companies", label: "Companies" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="companies" id={id} values={row} back={`/companies/${id}`} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "companies", id)} back="/companies" /></Card></div></>;
}
