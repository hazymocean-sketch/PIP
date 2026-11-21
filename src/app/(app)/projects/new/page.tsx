import { EntityForm } from "@/components/entity-form";
import { Flash, PageHead } from "@/components/ui";

export const metadata = { title: "New project" };
export default async function NewProject({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <><PageHead title="New project" crumbs={[{ href: "/projects", label: "Projects" }]} sub="Record only what you know. Leave unknown fields blank — they display as Unknown." />
    <Flash sp={sp} /><EntityForm entity="projects" defaults={{ country: "UAE", valueCurrency: "AED" }} /></>;
}
