import { IncidentsTable } from "@/components/incidents/list/incidents-table";
import { CATEGORIES } from "@/components/incidents/lib/labels";
import { EmptyLine } from "@/components/kit/empty";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { listIncidents } from "@/lib/data/incidents/query";
import { requestTime } from "@/lib/data/scope";

export const metadata = { title: "Incidents" };

export default async function IncidentsPage({ searchParams }: PageProps<"/incidents">) {
    const [incidents, params] = await Promise.all([listIncidents(), searchParams]);
    if (incidents.length === 0) {
        return (
            <div className={PAGE_LIST}>
                <PageHeading title="Incidents" />
                <EmptyLine>No incidents yet</EmptyLine>
            </div>
        );
    }
    const asked = typeof params.category === "string" ? params.category : "all";
    const category = (CATEGORIES as string[]).includes(asked) ? asked : "all";
    const now = await requestTime();

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Incidents" />
            <IncidentsTable incidents={incidents} now={now} initialCategory={category} />
        </div>
    );
}
