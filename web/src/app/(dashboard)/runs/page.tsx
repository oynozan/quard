import type { Metadata } from "next";
import { EmptyLine } from "@/components/kit/empty";
import { RunsBrowser } from "@/components/runs/list/runs-browser";
import { RunsHeading } from "@/components/runs/list/runs-heading";
import { RunsNoMatch } from "@/components/runs/list/runs-states";
import { RunsTable } from "@/components/runs/list/runs-table";
import { isFiltered, parseRunsFilter } from "@/components/runs/list/lib/params";
import { listRuns } from "@/lib/data/runs/query";
import { requestTime } from "@/lib/data/scope";
import { PAGE_LIST } from "@/components/kit/page";

export const metadata: Metadata = { title: "Runs" };

export default async function RunsPage({ searchParams }: PageProps<"/runs">) {
    const filter = parseRunsFilter(await searchParams);
    const filtered = isFiltered(filter);
    // Every run feeds the agent filter, and without filters it is also the list shown
    const [all, matched, now] = await Promise.all([
        listRuns(),
        filtered
            ? listRuns({
                  query: filter.q || undefined,
                  agent: filter.agent || undefined,
                  status: filter.status || undefined,
              })
            : null,
        requestTime(),
    ]);

    if (all.length === 0) {
        return (
            <div className={PAGE_LIST}>
                <RunsHeading />
                <EmptyLine>No runs yet</EmptyLine>
            </div>
        );
    }

    const runs = matched ?? all;
    const agents = [...new Set(all.flatMap((run) => run.agents))].sort();

    return (
        <div className={PAGE_LIST}>
            <RunsHeading count={runs.length} filtered={filtered} />
            <RunsBrowser filter={filter} agents={agents}>
                <p role="status" className="sr-only">
                    {filtered ? `${runs.length} ${runs.length === 1 ? "run matches" : "runs match"}` : ""}
                </p>
                {runs.length > 0 ? <RunsTable runs={runs} now={now} /> : <RunsNoMatch />}
            </RunsBrowser>
        </div>
    );
}
