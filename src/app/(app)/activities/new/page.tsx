import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New activity" };
export default async function New({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const back = sp.projectId ? `/projects/${sp.projectId}` : sp.opportunityId ? `/opportunities/${sp.opportunityId}` : sp.companyId ? `/companies/${sp.companyId}` : sp.contactId ? `/contacts/${sp.contactId}` : undefined;
  return <><PageHead title="New activity" crumbs={[{ href: "/activities", label: "Meetings & Activities" }]} />
    <Flash sp={sp} /><EntityForm entity="activities" defaults={{ projectId: sp.projectId, opportunityId: sp.opportunityId, companyId: sp.companyId, contactId: sp.contactId }} back={back} /></>;
}
