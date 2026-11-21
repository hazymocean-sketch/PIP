import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { newsItems } from "@/db/schema";
import { deleteEntity } from "@/server/actions";
import { EntityForm } from "@/components/entity-form";
import { Card, DeleteForm, Flash, PageHead } from "@/components/ui";

export default async function Edit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [row] = await db.select().from(newsItems).where(eq(newsItems.id, id));
  if (!row) notFound();
  return <><PageHead title={`Edit: ${row.title}`} crumbs={[{ href: "/news", label: "News & Updates" }]} />
    <Flash sp={sp} />
    <div className="stack"><EntityForm entity="news" id={id} values={row} back={"/news"} />
    <Card title="Delete"><DeleteForm action={deleteEntity.bind(null, "news", id)} back="/news" /></Card></div></>;
}
