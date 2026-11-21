import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!row) notFound();
  return <><PageHead title={`Edit: ${row.fullName}`} crumbs={[{ href: "/contacts", label: "Contacts" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="contacts" id={id} values={row} back={`/contacts/${id}`} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "contacts", id)} back="/contacts" /></Card></div></>;
}
