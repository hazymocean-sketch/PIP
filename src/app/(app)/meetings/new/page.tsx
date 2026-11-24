import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New meeting" };
export default async function New({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const date = /^\d{4}-\d\d-\d\d$/.test(sp.date ?? "") ? sp.date : null;
  const time = /^\d\d:\d\d$/.test(sp.time ?? "") ? sp.time : "10:00";
  const back = sp.back && /^\/(agenda|projects|opportunities|pipeline)/.test(sp.back) ? sp.back : "/agenda";
  return <><PageHead title="New meeting" crumbs={[{ href: "/agenda", label: "Agenda" }]} />
    <Flash sp={sp} /><EntityForm entity="meetings" back={back} defaults={{
      startsAt: date ? `${date}T${time}` : undefined, status: "scheduled",
      projectId: sp.projectId, opportunityId: sp.opportunityId, companyId: sp.companyId, contactId: sp.contactId, title: sp.title,
    }} /></>;
}
