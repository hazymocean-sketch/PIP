import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New company" };
export default async function New({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const back = sp.projectId ? `/projects/${sp.projectId}` : sp.opportunityId ? `/opportunities/${sp.opportunityId}` : sp.companyId ? `/companies/${sp.companyId}` : sp.contactId ? `/contacts/${sp.contactId}` : undefined;
  return <><PageHead title="New company" crumbs={[{ href: "/companies", label: "Companies" }]} />
    <Flash sp={sp} /><EntityForm entity="companies" defaults={{}} back={undefined} /></>;
}
