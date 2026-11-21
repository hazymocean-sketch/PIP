import { db } from "@/db";
import { ventures } from "@/db/schema";
import { WorkflowForm } from "@/components/workflow-form";
import { Flash, PageHead } from "@/components/ui";

export default async function NewWf({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const v = await db.select({ id: ventures.id, name: ventures.name }).from(ventures).orderBy(ventures.sortOrder);
  return <><PageHead title="New workflow" crumbs={[{ href: "/automations", label: "Workflows" }]} /><Flash sp={sp} /><WorkflowForm ventures={v} /></>;
}
