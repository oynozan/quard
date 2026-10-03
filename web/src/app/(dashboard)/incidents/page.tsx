import { PageHeading } from "@/components/kit/headings";
import { IncidentsTable } from "@/components/incidents/list/incidents-table";
import { CATEGORIES } from "@/components/incidents/lib/labels";
import { listIncidents } from "@/lib/data/incidents/query";
import { NOW } from "@/lib/data/rng";
import { PAGE_LIST } from "@/components/kit/page";

export const metadata = { title: "Incidents" };

export default async function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
    const [incidents, params] = await Promise.all([listIncidents(), searchParams]);
    const asked = typeof params.category === "string" ? params.category : "all";
    const category = (CATEGORIES as string[]).includes(asked) ? asked : "all";

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Incidents" />
            <IncidentsTable incidents={incidents} now={NOW} initialCategory={category} />
        </div>
    );
}
