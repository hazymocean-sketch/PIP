import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New task" };
export default async function New({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const safeBack = sp.back && /^\/(agenda|tasks|projects|opportunities|pipeline)(\/|\?|$)/.test(sp.back) ? sp.back : undefined;
  const back = safeBack ?? (sp.projectId ? `/projects/${sp.projectId}` : sp.opportunityId ? `/opportunities/${sp.opportunityId}` : sp.companyId ? `/companies/${sp.companyId}` : sp.contactId ? `/contacts/${sp.contactId}` : undefined);
  const dueDate = /^\d{4}-\d\d-\d\d$/.test(sp.date ?? "") ? sp.date : undefined;
  return <><PageHead title="New task" crumbs={[{ href: "/tasks", label: "Tasks & Follow-ups" }]} />
    <Flash sp={sp} /><EntityForm entity="tasks" defaults={{ projectId: sp.projectId, opportunityId: sp.opportunityId, companyId: sp.companyId, contactId: sp.contactId , status: "open", priority: "medium", dueDate, title: sp.title }} back={back} /></>;
}
