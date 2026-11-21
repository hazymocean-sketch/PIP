import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New task" };
export default async function New({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const back = sp.projectId ? `/projects/${sp.projectId}` : sp.opportunityId ? `/opportunities/${sp.opportunityId}` : sp.companyId ? `/companies/${sp.companyId}` : sp.contactId ? `/contacts/${sp.contactId}` : undefined;
  return <><PageHead title="New task" crumbs={[{ href: "/tasks", label: "Tasks & Follow-ups" }]} />
    <Flash sp={sp} /><EntityForm entity="tasks" defaults={{ projectId: sp.projectId, opportunityId: sp.opportunityId, companyId: sp.companyId, contactId: sp.contactId , status: "open", priority: "medium" }} back={back} /></>;
}
