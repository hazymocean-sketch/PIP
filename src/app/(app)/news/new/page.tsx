import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New news item" };
export default async function New({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const back = sp.projectId ? `/projects/${sp.projectId}` : sp.opportunityId ? `/opportunities/${sp.opportunityId}` : sp.companyId ? `/companies/${sp.companyId}` : sp.contactId ? `/contacts/${sp.contactId}` : undefined;
  return <><PageHead title="New news item" crumbs={[{ href: "/news", label: "News & Updates" }]} />
    <Flash sp={sp} /><EntityForm entity="news" defaults={{ projectId: sp.projectId }} back={back} /></>;
}
